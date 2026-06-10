'use strict';

const axios = require('axios');
const { LLM_CONFIG } = require('../constants');
const { handleAPIError } = require('../utils/ErrorHelper');

/**
 * LLMService — manages Zoho OAuth token lifecycle and wraps the Catalyst LLM
 * (GLM-4.7B Flash, OpenAI-style messages API) with caching, retry logic, and
 * response normalisation.
 *
 * Token flow:
 *   1. Check Catalyst Cache segment for a cached token.
 *   2. If not cached, fetch a new token via the Catalyst Connection API.
 *   3. Store the new token in cache with a 55-minute TTL (tokens expire at 60 min).
 *
 * LLM call flow:
 *   1. Acquire access token.
 *   2. POST { model, messages, max_tokens, temperature, stream } to the GLM endpoint.
 *   3. On 5xx response retry up to MAX_RETRIES times with exponential back-off.
 *   4. Return normalised { response, usage } or throw a structured error.
 */
class LLMService {
  static MAX_RETRIES = 3;
  static RETRY_DELAY_MS = 1000;

  /**
   * Bounded concurrency semaphore — allows up to MAX_CONCURRENT LLM calls in
   * flight simultaneously. This replaces the old fully-serial promise chain that
   * made every user wait for every other user's call to finish first.
   * GLM-4.7B handles several parallel requests fine; 4 is a safe ceiling that
   * prevents token-rate exhaustion while allowing real parallelism.
   */
  static MAX_CONCURRENT = 4;
  static _activeCount   = 0;
  static _waitQueue     = [];

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

  // ─── Concurrency helpers ─────────────────────────────────────────────────────

  static async _acquireSlot() {
    if (LLMService._activeCount < LLMService.MAX_CONCURRENT) {
      LLMService._activeCount++;
      return;
    }
    // Queue until a slot frees up (FIFO).
    await new Promise((resolve) => LLMService._waitQueue.push(resolve));
    LLMService._activeCount++;
  }

  static _releaseSlot() {
    LLMService._activeCount--;
    if (LLMService._waitQueue.length > 0) {
      const next = LLMService._waitQueue.shift();
      next();
    }
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
    await LLMService._acquireSlot();
    try {
      return await this._callWithRetry(prompt, systemPrompt, options, LLMService.MAX_RETRIES);
    } finally {
      LLMService._releaseSlot();
    }
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

    // GLM API is OpenAI-style: max_tokens caps OUTPUT tokens only (not input+output).
    const maxOutputTokens = options.max_tokens ?? LLM_CONFIG.MAX_TOKENS;

    const messages = [];
    if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
    messages.push({ role: 'user', content: prompt });

    const payload = {
      model:       LLM_CONFIG.MODEL,
      messages,
      temperature: options.temperature ?? LLM_CONFIG.TEMPERATURE,
      max_tokens:  maxOutputTokens,
      stream:      false,
      // Disable GLM-4.7 "thinking" mode — chain-of-thought leaks into the response,
      // breaks JSON-only prompts, and can echo internal system rules to the UI.
      chat_template_kwargs: { enable_thinking: false },
    };

    const headers = {
      'Content-Type': 'application/json',
      Authorization:  `Bearer ${token}`,
      'CATALYST-ORG': process.env.ORG_ID,
    };

    console.log(`[LLMService] Calling LLM | model=${LLM_CONFIG.MODEL} | max_tokens=${payload.max_tokens} | prompt_len=${prompt.length}`);

    try {
      const response = await axios.post(LLM_CONFIG.ENDPOINT, payload, { headers, timeout: 90000 });
      // GLM (OpenAI-style) puts the answer at choices[0].message.content. Some Catalyst
      // deployments wrap the OpenAI response inside a `data` envelope, so try both.
      // NOTE: never fall back to `message.reasoning` — that's GLM's chain-of-thought and
      // will leak the system prompt to the UI.
      const root    = response.data?.choices ? response.data : (response.data?.data ?? response.data);
      const choice  = root?.choices?.[0];
      const text    = choice?.message?.content || root?.response;
      const usage   = root?.usage;

      if (!text) {
        console.warn('[LLMService] Empty content. Raw response body:', JSON.stringify(response.data, null, 2));
        throw new Error('LLM returned an empty response body.');
      }

      console.log(`[LLMService] LLM success | tokens_used=${usage?.total_tokens ?? '?'}`);
      return { response: text, usage: usage ?? {} };

    } catch (err) {
      const isServerError = err.response?.status >= 500;
      const isTimeout     = err.code === 'ECONNABORTED';

      // Token-limit errors are a 400 wrapped in a 500 — retrying won't help.
      const innerCode = err.response?.data?.details?.error?.code;
      const isTokenLimitError = innerCode === 400 &&
        String(err.response?.data?.details?.error?.message ?? '').includes('token length');
      if (isTokenLimitError) {
        const structured = handleAPIError(err, 'LLM');
        console.error('[LLMService] Token limit exceeded (non-retryable):', JSON.stringify(structured, null, 2));
        throw Object.assign(new Error(structured.details?.error?.message || structured.message), { llmError: structured });
      }

      // "Failure from server side" = the model itself crashed — retrying never helps.
      const statusMsg = String(
        err.response?.data?.details?.status_details?.message ??
        err.response?.data?.status_details?.message ?? ''
      ).toLowerCase();
      const isModelCrash = statusMsg.includes('failure from server') || statusMsg.includes('failure from server side');
      if (isModelCrash) {
        console.warn('[LLMService] Model server-side failure (non-retryable) — skipping retries');
        throw Object.assign(new Error('LLM model unavailable (server-side failure)'), { llmError: err.response?.data });
      }

      if ((isServerError || isTimeout) && retriesLeft > 0) {
        const delay = LLMService.RETRY_DELAY_MS * (LLMService.MAX_RETRIES - retriesLeft + 1);
        console.warn(`[LLMService] Transient error (${err.message}), retrying in ${delay}ms… (${retriesLeft} left)`);
        await new Promise((r) => setTimeout(r, delay));
        return this._callWithRetry(prompt, systemPrompt, options, retriesLeft - 1);
      }

      const structured = handleAPIError(err, 'LLM');
      console.warn('[LLMService] LLM call failed:', JSON.stringify(structured, null, 2));
      if (err.response?.data) {
        console.warn('[LLMService] Raw error body:', JSON.stringify(err.response.data, null, 2));
      }
      throw Object.assign(new Error(structured.message), { llmError: structured });
    }
  }
}

module.exports = LLMService;
