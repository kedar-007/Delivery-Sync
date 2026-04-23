'use strict';

const axios = require('axios');
const { LLM_CONFIG } = require('../utils/Constants');

class LLMService {
  static MAX_RETRIES = 3;
  static RETRY_DELAY = 1500;
  static _llmQueue   = Promise.resolve();

  constructor(catalystApp) {
    if (!catalystApp) throw new Error('catalystApp required');
    this.catalystApp  = catalystApp;
    this.cacheSegment = catalystApp.cache().segment();
  }

  // ─── Token ─────────────────────────────────────────────────────────────────

  async getAccessToken() {
    const env          = process.env.ENVIRONMENT || 'DEVELOPMENT';
    const refreshToken = env === 'PRODUCTION'
      ? process.env.REFRESH_TOKEN_PROD
      : process.env.REFRESH_TOKEN_DEV;

    if (!refreshToken) throw new Error('Zoho refresh token not configured.');

    // Step 1: check shared cache (same key used by ai_service — avoids double token fetches)
    console.log(`[LLMService] Step 1 — checking cache for token (key=${LLM_CONFIG.CACHE_KEY}, shared with ai_service)`);
    try {
      const cached = await this.cacheSegment.get(LLM_CONFIG.CACHE_KEY);
      if (cached?.cache_value) {
        console.log('[LLMService] Step 1 ✓ — token served from shared cache (no new token needed)');
        return cached.cache_value;
      }
      console.log('[LLMService] Step 1 — cache miss, will fetch fresh token');
    } catch (err) {
      console.warn('[LLMService] Step 1 — cache read error (non-fatal):', err.message);
    }

    // Step 2: fetch fresh token from Zoho OAuth
    console.log('[LLMService] Step 2 — fetching fresh Zoho OAuth token');
    let token;
    try {
      const params = new URLSearchParams({
        grant_type:    'refresh_token',
        client_id:     process.env.CLIENT_ID,
        client_secret: process.env.CLIENT_SECRET,
        refresh_token: refreshToken,
      });
      const resp = await axios.post(
        'https://accounts.zoho.in/oauth/v2/token',
        params.toString(),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 10000 }
      );
      token = resp.data?.access_token;
    } catch (err) {
      throw new Error('Failed to fetch Zoho access token: ' + err.message);
    }

    if (!token) throw new Error('Zoho returned empty access token.');
    console.log('[LLMService] Step 2 ✓ — fresh token acquired');

    // Step 3: write back to shared cache so ai_service can reuse it too
    console.log(`[LLMService] Step 3 — storing token in shared cache (TTL=${LLM_CONFIG.CACHE_TTL_HOURS}h, key=${LLM_CONFIG.CACHE_KEY})`);
    try {
      await this.cacheSegment.put(LLM_CONFIG.CACHE_KEY, token, LLM_CONFIG.CACHE_TTL_HOURS);
      console.log('[LLMService] Step 3 ✓ — token cached');
    } catch (err) {
      console.warn('[LLMService] Step 3 — cache write failed (non-fatal):', err.message);
    }

    return token;
  }

  // ─── Single-turn call ──────────────────────────────────────────────────────

  async call(prompt, systemPrompt, options = {}) {
    let release;
    const slot = new Promise((r) => { release = r; });
    const prev = LLMService._llmQueue;
    LLMService._llmQueue = slot;
    console.log('[LLMService] Queued LLM call — waiting for queue slot');
    await prev;
    console.log('[LLMService] Queue slot acquired — starting LLM call');
    try {
      return await this._callWithRetry(prompt, systemPrompt, options, LLMService.MAX_RETRIES);
    } finally {
      release();
      console.log('[LLMService] Queue slot released');
    }
  }

  // ─── Multi-turn call ───────────────────────────────────────────────────────

  async callWithHistory(messages, systemPrompt, options = {}) {
    const history = messages.slice(0, -1);
    const current = messages[messages.length - 1];
    console.log(`[LLMService] callWithHistory — history_turns=${history.length}, current_message_len=${current.content.length}`);

    let prompt = '';
    if (history.length > 0) {
      prompt += '[CONVERSATION HISTORY]\n';
      for (const m of history) {
        const role = m.role === 'user' ? 'User' : 'Assistant';
        prompt += `${role}: ${m.content}\n`;
      }
      prompt += '\n';
    }
    prompt += `[CURRENT MESSAGE]\nUser: ${current.content}`;
    console.log(`[LLMService] Prompt assembled — total_prompt_len=${prompt.length}`);

    return this.call(prompt, systemPrompt, options);
  }

  // ─── Internal ──────────────────────────────────────────────────────────────

  async _callWithRetry(prompt, systemPrompt, options, retriesLeft) {
    const token = await this.getAccessToken();

    const maxTokens = options.max_tokens ?? LLM_CONFIG.MAX_TOKENS;
    const inputEst  = Math.ceil(prompt.length / 2.5);
    const effective = Math.min(2048, inputEst + maxTokens);

    const payload = {
      prompt,
      model:         LLM_CONFIG.MODEL,
      system_prompt: systemPrompt,
      top_p:         options.top_p       ?? LLM_CONFIG.TOP_P,
      top_k:         options.top_k       ?? LLM_CONFIG.TOP_K,
      best_of:       LLM_CONFIG.BEST_OF,
      temperature:   options.temperature ?? LLM_CONFIG.TEMPERATURE,
      max_tokens:    effective,
    };

    const headers = {
      'Content-Type': 'application/json',
      Authorization:  `Bearer ${token}`,
      'CATALYST-ORG': process.env.ORG_ID,
    };

    console.log(`[LLMService] Calling LLM | model=${LLM_CONFIG.MODEL} | max_tokens=${effective} | prompt_len=${prompt.length} | retriesLeft=${retriesLeft}`);

    try {
      const res  = await axios.post(LLM_CONFIG.ENDPOINT, payload, { headers, timeout: 90000 });
      const text = res.data?.response;
      if (!text) throw new Error('LLM returned empty response.');
      const usage = res.data?.usage ?? {};
      console.log(`[LLMService] LLM success | tokens_used=${usage.total_tokens ?? '?'} | response_len=${text.length}`);
      return { response: text, usage };
    } catch (err) {
      const isTransient = err.response?.status >= 500 || err.code === 'ECONNABORTED';
      if (isTransient && retriesLeft > 0) {
        const delay = LLMService.RETRY_DELAY * (LLMService.MAX_RETRIES - retriesLeft + 1);
        console.warn(`[LLMService] Transient error (${err.message}) — retrying in ${delay}ms (${retriesLeft} retries left)`);
        await new Promise((r) => setTimeout(r, delay));
        return this._callWithRetry(prompt, systemPrompt, options, retriesLeft - 1);
      }
      console.error('[LLMService] LLM call failed (non-retryable):', err.response?.data ?? err.message);
      throw new Error(err.message || 'LLM call failed');
    }
  }
}

module.exports = LLMService;
