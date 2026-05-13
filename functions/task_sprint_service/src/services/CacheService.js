'use strict';

/**
 * CacheService — thin wrapper around the Catalyst Cache SDK.
 *
 * Catalyst cache stores STRINGS only, so this wrapper JSON-serialises on
 * write and JSON-parses on read for non-string values.
 *
 * Safety properties:
 *  - All operations are wrapped in try/catch. A cache miss, a transient
 *    network error, or an SDK failure NEVER throws — callers receive `null`
 *    on read miss and the put/delete becomes a no-op. The application
 *    continues to function exactly as it did before cache existed; cache
 *    failure degrades to "fetch from DB" silently.
 *  - Per-tenant key namespacing prevents accidental cross-tenant reads.
 *
 * Catalyst Cache hard limits (Dev environment):
 *  - Max 20 segments / project
 *  - Max 5 MB per segment (total across all keys)
 *  - Max 16,000 characters per cache item (value)
 *  - Max 500 characters per cache key
 *  - Default expiration: 2 days (we override per-call with a smaller TTL)
 *  - Free tier: 1,000 GETs / month (we exceed this — informational only)
 *
 * We enforce the per-item-char and per-key-char limits client-side so
 * oversized writes are skipped cleanly (logged + counted) instead of
 * hitting the SDK error path on every write attempt.
 */

const MAX_ITEM_CHARS = 16000;
const MAX_KEY_CHARS  = 500;

const stats = {
  initialized:    0,
  initFailures:   0,
  gets:           0,
  hits:           0,
  misses:         0,
  sets:           0,
  setFailures:    0,
  setSkippedSize: 0,
  setSkippedKey:  0,
  invalidations:  0,
  lastError:      null,
};

let _firstInitLogged = false;

class CacheService {
  constructor(catalystApp, segmentId) {
    this.app = catalystApp;
    this._segment = null;
    this._initError = null;
    try {
      const svc = catalystApp.cache();
      this._segment = segmentId ? svc.segment(segmentId) : svc.segment();
      stats.initialized++;
    } catch (err) {
      stats.initFailures++;
      stats.lastError = `init: ${err.message}`;
      this._initError = err.message;
      if (!_firstInitLogged) {
        _firstInitLogged = true;
        console.warn(`[CacheService] First init failure (cache disabled): ${err.message}`);
        console.warn(`[CacheService] Likely causes: (1) cache not enabled in Catalyst console; (2) default segment not created; (3) SDK version mismatch.`);
      }
    }
  }

  static key(...parts) {
    return parts.filter(Boolean).map(String).join(':');
  }

  async get(key) {
    if (!this._segment) return null;
    if (key && key.length > MAX_KEY_CHARS) return null;
    stats.gets++;
    try {
      const raw = await this._segment.get(key);
      const val = raw?.cache_value;
      if (val == null) { stats.misses++; return null; }
      stats.hits++;
      try { return JSON.parse(val); }
      catch (_) { return val; }
    } catch (err) {
      stats.misses++;
      stats.lastError = `get(${key}): ${err.message}`;
      return null;
    }
  }

  async set(key, value, ttlHours = 1) {
    if (!this._segment) return false;
    if (key && key.length > MAX_KEY_CHARS) {
      stats.setSkippedKey++;
      console.warn(`[CacheService] set skipped — key length ${key.length} > ${MAX_KEY_CHARS}: ${key.slice(0, 80)}…`);
      return false;
    }
    const payload = typeof value === 'string' ? value : JSON.stringify(value);
    if (payload.length > MAX_ITEM_CHARS) {
      stats.setSkippedSize++;
      console.warn(`[CacheService] set skipped — payload ${payload.length} chars > ${MAX_ITEM_CHARS} for key ${key}. Caller should slim the cached value.`);
      return false;
    }
    try {
      try {
        await this._segment.put(key, payload, ttlHours);
      } catch (putErr) {
        await this._segment.update(key, payload);
      }
      stats.sets++;
      return true;
    } catch (err) {
      stats.setFailures++;
      stats.lastError = `set(${key}): ${err.message}`;
      console.warn(`[CacheService] set(${key}) failed:`, err.message);
      return false;
    }
  }

  async invalidate(key) {
    if (!this._segment) return false;
    stats.invalidations++;
    try {
      await this._segment.delete(key);
      return true;
    } catch (err) {
      stats.lastError = `invalidate(${key}): ${err.message}`;
      return false;
    }
  }

  async healthCheck() {
    const report = {
      ok: false,
      segmentInitialized: this._segment !== null,
      initError: this._initError,
      roundTrip: { put: false, get: false, value: null, error: null },
      stats: CacheService.getStats(),
    };
    if (!this._segment) return report;
    const probeKey   = `__health:${Date.now()}`;
    const probeValue = `probe-${Math.random().toString(36).slice(2)}`;
    try {
      const setOk = await this.set(probeKey, probeValue, 1 / 120);
      report.roundTrip.put = setOk;
      if (setOk) {
        const readBack = await this.get(probeKey);
        report.roundTrip.get   = readBack === probeValue;
        report.roundTrip.value = readBack;
        await this.invalidate(probeKey);
      }
      report.ok = report.roundTrip.put && report.roundTrip.get;
    } catch (err) {
      report.roundTrip.error = err.message;
    }
    return report;
  }

  static getStats() {
    const hitRate = stats.gets > 0 ? (stats.hits / stats.gets) : 0;
    return { ...stats, hitRate: Number(hitRate.toFixed(3)) };
  }

  static resetStats() {
    stats.initialized    = 0;
    stats.initFailures   = 0;
    stats.gets           = 0;
    stats.hits           = 0;
    stats.misses         = 0;
    stats.sets           = 0;
    stats.setFailures    = 0;
    stats.setSkippedSize = 0;
    stats.setSkippedKey  = 0;
    stats.invalidations  = 0;
    stats.lastError      = null;
  }

  static get LIMITS() {
    return { MAX_ITEM_CHARS, MAX_KEY_CHARS };
  }
}

module.exports = CacheService;
