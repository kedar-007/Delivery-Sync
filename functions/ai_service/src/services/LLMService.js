'use strict';

const axios = require('axios');
const { LLM_CONFIG } = require('../constants');
const { handleAPIError } = require('../utils/ErrorHelper');

/**
 * LLMService — manages Zoho OAuth token lifecycle and wraps the Catalyst LLM
 * (Qwen 30B MoE) with caching, retry logic, and response normalisation.
 *
 * Token flow:
 *   1. Check Catalyst Cache segment for a cached token.
 *   2. If not cached, fetch a new token via the Catalyst Connection API.
 *   3. Store the new token in cache with a 55-minute TTL (tokens expire at 60 min).
 *
 * LLM call flow:
 *   1. Acquire access token.
 *   2. POST prompt to the Zoho QuickML LLM endpoint.
 *   3. On 5xx response retry up to MAX_RETRIES times with exponential back-off.
 *   4. Return normalised { response, usage } or throw a structured error.
 */
class LLMService {
  static MAX_RETRIES = 2;
  static RETRY_DELAY_MS = 1000;

  /**
   * @param {object} catalystApp  – Initialised Catalyst SDK instance (req.catalystApp)
   */
  constructor(catalystApp) {
    if (!catalystApp) throw new Error('catalystApp is required for LLMService');
    this.catalystApp = catalystApp;
    this.cacheSegment = catalystApp.cache().segment();
  }

  // ─── Token Management ───────────────────────────────────────────────────────

  /**
   * Returns a valid Zoho OAuth access token, served from Catalyst Cache when
   * possible to avoid hammering the token endpoint.
   *
   * @returns {Promise<string>}
   */
  async getAccessToken() {
    const env = process.env.ENVIRONMENT || 'DEVELOPMENT';
    const refreshToken = env === 'PRODUCTION'
      ? process.env.REFRESH_TOKEN_PROD
      : process.env.REFRESH_TOKEN_DEV;

    if (!refreshToken) {
      throw new Error('Zoho refresh token not configured. Set REFRESH_TOKEN_PROD / REFRESH_TOKEN_DEV env var.');
    }

    // 1. Cache hit
    try {
      const cached = await this.cacheSegment.get(LLM_CONFIG.CACHE_KEY);
      if (cached?.cache_value) {
        console.log('[LLMService] Access token served from cache.');
        return cached.cache_value;
      }
    } catch (_) {
      // Cache miss or segment error — fall through to fetch a fresh token.
    }

    // 2. Fetch fresh token directly from Zoho OAuth endpoint
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

    if (!token) throw new Error('Zoho returned an empty access token.');

    // 3. Cache for 55 minutes (tokens expire at 60 min — 5-min safety margin)
    try {
      await this.cacheSegment.put(LLM_CONFIG.CACHE_KEY, token, LLM_CONFIG.CACHE_TTL_HOURS);
    } catch (_) {
      // Non-fatal — we still have a valid token for this request.
      console.warn('[LLMService] Could not write token to cache:', _.message);
    }

    console.log('[LLMService] Fresh access token acquired and cached.');
    return token;
  }

  // ─── LLM Call ───────────────────────────────────────────────────────────────

  /**
   * Calls the Zoho Catalyst LLM endpoint with retry logic on transient failures.
   *
   * @param {string} prompt         – User prompt (data + instructions)
   * @param {string} systemPrompt   – System role / persona
   * @param {object} options        – Override LLM parameters (max_tokens etc.)
   * @returns {Promise<{ response: string, usage: object }>}
   */
  async call(prompt, systemPrompt, options = {}) {
    return this._callWithRetry(prompt, systemPrompt, options, LLMService.MAX_RETRIES);
  }

  /**
   * Internal: executes the LLM HTTP request, retrying on 5xx with exponential back-off.
   */
  async _callWithRetry(prompt, systemPrompt, options, retriesLeft) {
    let token;
    try {
      token = await this.getAccessToken();
    } catch (tokenErr) {
      throw tokenErr;
    }

    const payload = {
      prompt,
      model:         LLM_CONFIG.MODEL,
      system_prompt: systemPrompt,
      top_p:         options.top_p         ?? LLM_CONFIG.TOP_P,
      top_k:         options.top_k         ?? LLM_CONFIG.TOP_K,
      best_of:       options.best_of       ?? LLM_CONFIG.BEST_OF,
      temperature:   options.temperature   ?? LLM_CONFIG.TEMPERATURE,
      max_tokens:    options.max_tokens    ?? LLM_CONFIG.MAX_TOKENS,
    };

    const headers = {
      'Content-Type': 'application/json',
      Authorization:  `Bearer ${token}`,
      'CATALYST-ORG': process.env.ORG_ID,
    };

    console.log(`[LLMService] Calling LLM | model=${LLM_CONFIG.MODEL} | max_tokens=${payload.max_tokens} | prompt_len=${prompt.length}`);

    try {
      const response = await axios.post(LLM_CONFIG.ENDPOINT, payload, { headers, timeout: 30000 });
      const { response: text, usage } = response.data;

      if (!text) throw new Error('LLM returned an empty response body.');

      console.log(`[LLMService] LLM success | tokens_used=${usage?.total_tokens ?? '?'}`);
      return { response: text, usage: usage ?? {} };

    } catch (err) {
      const isServerError = err.response?.status >= 500;
      const isTimeout     = err.code === 'ECONNABORTED';

      if ((isServerError || isTimeout) && retriesLeft > 0) {
        const delay = LLMService.RETRY_DELAY_MS * (LLMService.MAX_RETRIES - retriesLeft + 1);
        console.warn(`[LLMService] Transient error (${err.message}), retrying in ${delay}ms… (${retriesLeft} left)`);
        await new Promise((r) => setTimeout(r, delay));
        return this._callWithRetry(prompt, systemPrompt, options, retriesLeft - 1);
      }

      const structured = handleAPIError(err, 'LLM');
      console.error('[LLMService] LLM call failed:', structured);
      throw Object.assign(new Error(structured.message), { llmError: structured });
    }
  }
}

module.exports = LLMService;
