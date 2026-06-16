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
 *
 * Observability:
 *  - Process-lifetime counters (CacheService.stats) record hits / misses /
 *    sets / errors. Read with CacheService.getStats() and reset with
 *    CacheService.resetStats(). Exposed via the /api/admin/cache/health
 *    endpoint to make it obvious whether the cache is actually running.
 *  - First init failure per process is logged with the full error message so
 *    deployment misconfigurations (segment not created, cache not enabled)
 *    show up in the Catalyst function logs.
 */

// Catalyst Cache Dev limits — see header for source.
const MAX_ITEM_CHARS = 16000;
const MAX_KEY_CHARS  = 500;

// Static (process-lifetime) counters. Reset on cold start.
const stats = {
  initialized:    0, // successful segment init
  initFailures:   0, // segment init threw
  gets:           0,
  hits:           0,
  misses:         0,
  sets:           0,
  setFailures:    0,
  setSkippedSize: 0, // payload exceeded MAX_ITEM_CHARS — skipped silently
  setSkippedKey:  0, // key exceeded MAX_KEY_CHARS — skipped silently
  invalidations:  0,
  lastError:      null,
};

let _firstInitLogged = false;

class CacheService {
  /**
   * @param {object} catalystApp - the initialised Catalyst app from req.catalystApp
   * @param {string} [segmentId] - optional segment id; default segment otherwise
   */
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
      // Log the first init failure per process at WARN so it's visible in
      // Catalyst function logs. Subsequent failures are silent to avoid
      // log spam, but the counter keeps incrementing.
      if (!_firstInitLogged) {
        _firstInitLogged = true;
        console.warn(`[CacheService] First init failure (cache disabled): ${err.message}`);
        console.warn(`[CacheService] Likely causes: (1) cache not enabled in Catalyst console; (2) default segment not created; (3) SDK version mismatch. Verify at https://console.catalyst.zoho.com/`);
      }
    }
  }

  /**
   * Build a namespaced cache key.
   *   key('tenant', '17682...')          → 'tenant:17682...'
   *   key('authCtx', 'v1', '17682...')   → 'authCtx:v1:17682...'
   */
  static key(...parts) {
    return parts.filter(Boolean).map(String).join(':');
  }

  /**
   * Read a value. Returns the parsed JS value (object/array/number) or
   * the raw string if it wasn't JSON-encoded. Returns null on miss / error.
   */
  async get(key) {
    if (!this._segment) return null;
    if (key && key.length > MAX_KEY_CHARS) return null; // unreadable — wouldn't have been written
    stats.gets++;
    try {
      const raw = await this._segment.get(key);
      const val = raw?.cache_value;
      if (val == null) {
        stats.misses++;
        return null;
      }
      stats.hits++;
      // Try JSON parse — most callers store structured data
      try { return JSON.parse(val); }
      catch (_) { return val; } // raw string
    } catch (err) {
      stats.misses++;
      stats.lastError = `get(${key}): ${err.message}`;
      return null;
    }
  }

  /**
   * Write a value. Auto JSON-stringifies non-string inputs. TTL in hours
   * (Catalyst's native unit). Returns true on success, false on failure.
   *
   * Skipped (logged + counted, NOT an error) when:
   *  - the segment is uninitialised (cache disabled)
   *  - the key exceeds 500 chars (Catalyst limit)
   *  - the payload exceeds 16,000 chars (Catalyst limit)
   * In all skip cases the caller continues normally — the next request
   * just re-does the underlying work (e.g. a DB query).
   */
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
      // Catalyst cache treats absent records as "put", existing as "update"
      // — try put first, fall through to update on duplicate-key errors.
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

  /**
   * Delete a key. Used for invalidation when underlying data changes.
   * Returns true if the delete reached the cache (even if key was absent).
   */
  async invalidate(key) {
    if (!this._segment) return false;
    stats.invalidations++;
    try {
      await this._segment.delete(key);
      return true;
    } catch (err) {
      // 'Key not found' is fine — it's already gone.
      stats.lastError = `invalidate(${key}): ${err.message}`;
      return false;
    }
  }

  /**
   * Runtime health check — exposed via the /api/admin/cache/health route.
   * Writes a temporary key, reads it back, and reports whether the round
   * trip worked. Use this to verify cache wiring after deploy.
   *
   * Returns { ok, segmentInitialized, roundTrip, initError, stats }
   */
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
      const setOk = await this.set(probeKey, probeValue, 1 / 120); // 30 sec TTL
      report.roundTrip.put = setOk;
      if (setOk) {
        const readBack = await this.get(probeKey);
        report.roundTrip.get   = readBack === probeValue;
        report.roundTrip.value = readBack;
        await this.invalidate(probeKey); // cleanup
      }
      report.ok = report.roundTrip.put && report.roundTrip.get;
    } catch (err) {
      report.roundTrip.error = err.message;
    }
    return report;
  }

  /** Process-lifetime counters. */
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

  /**
   * Bust the auth-context cache for one user across ALL microservices.
   *
   * Every service maintains its own scoped auth-ctx key so a permission change
   * in delivery_sync_function must also clear the user's cached context in
   * people_service, task_sprint_service, etc. — otherwise those services keep
   * serving stale permissions until their individual TTLs expire.
   *
   * Call this whenever any of the following change for a user:
   *   - Catalyst role (TEAM_MEMBER / TENANT_ADMIN)
   *   - Org-role assignment (user_org_roles table)
   *   - Per-user permission overrides (permission_overrides table)
   *   - Org-role permissions change (setRolePermissions — iterate all members)
   */
  static async invalidateUserAuthCtx(catalystApp, userId) {
    try {
      const cache = new CacheService(catalystApp);
      const uid = String(userId);
      await Promise.allSettled([
        cache.invalidate(`authCtx:v1:${uid}`),           // delivery_sync_function
        cache.invalidate(`authCtx:people:v1:${uid}`),    // people_service
        cache.invalidate(`authCtx:tasks:v1:${uid}`),     // task_sprint_service
        cache.invalidate(`authCtx:assets:v1:${uid}`),    // asset_service
        cache.invalidate(`authCtx:reports:v1:${uid}`),   // reporting_service
        cache.invalidate(`authCtx:badges:v1:${uid}`),    // badge_profile_service
        cache.invalidate(`authCtx:admin:v1:${uid}`),     // admin_config_service
        cache.invalidate(`authCtx:time:v1:${uid}`),      // time_tracking_service
      ]);
    } catch (_) {}
  }

  /** Catalyst Cache dev-env limits (exported for callers that want to pre-check). */
  static get LIMITS() {
    return { MAX_ITEM_CHARS, MAX_KEY_CHARS };
  }
}

module.exports = CacheService;
