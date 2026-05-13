# Catalyst Cache — Usage Map

> **Status:** Cost-optimized rollout (2026-05-13). Covers `delivery_sync_function`.
> Scope expands to other services (`people_service`, `task_sprint_service`, etc.)
> in subsequent passes.

This doc lists every place we use Zoho Catalyst Cloud Scale Cache, **why** the
read is cached, the **TTL**, the **invalidation trigger**, and the **measurable
benefit & cost**. New cache call sites must be added here in the same shape.

---

## TL;DR — design driven by Catalyst Cache pricing

Zoho charges per cache call once you exceed the free tier:

| Op     | Free tier | Beyond free tier | Per-call cost |
|--------|-----------|------------------|---------------|
| Get    | 1,000     | ₹2.4 / 2,000 calls (chargeable 1,000) | **₹0.0024** |
| Put    | 5,000     | ₹3.6 / 6,000 calls (chargeable 1,000) | **₹0.0036** |
| Update | 5,000     | ₹3.6 / 6,000 calls (chargeable 1,000) | **₹0.0036** |

A naïve "cache every DB lookup separately" design would have charged 6 gets per
authenticated request → ~₹2,300/month at moderate load (50 active users × 100
API calls/day). So instead we **collapse all of AuthMiddleware's cacheable
state into ONE cache key** per user. That brings cache cost down ~6× while
keeping the full DB-reduction benefit.

---

## Why we cache at all

Every authenticated API request in this app goes through `AuthMiddleware`,
which performs **5–6 DataStore queries** before any controller code runs:

1. `users` lookup (by email) — actual identity (always hit — not cacheable)
2. `tenants` lookup (name, slug, status, settings)
3. `user_org_roles` lookup (which org role is this user in?)
4. `org_roles` lookup (role name)
5. `org_role_permissions` lookup (the permission JSON — biggest payload)
6. `org_sharing_rules` lookup (data visibility scope)
7. `permission_overrides` lookup (per-user grants/revokes)

For a single page load that fires 10–20 API calls in parallel (dashboard +
attendance + leave + projects + …), that's **50–120 redundant DataStore round
trips** for data that **almost never changes mid-session**.

The unified-cache design replaces all of #2–7 with a single cache read.

---

## Architecture

### Shared wrapper

[`functions/delivery_sync_function/src/services/CacheService.js`](../functions/delivery_sync_function/src/services/CacheService.js)
wraps the raw Catalyst SDK with three concerns the bare SDK doesn't address:

1. **JSON serialization** — Catalyst cache stores strings only. The wrapper
   auto-stringifies on `set` and auto-parses on `get`.
2. **Graceful degradation** — every operation is wrapped in `try/catch`.
   A cache outage **never breaks the app**; reads return `null` and writes
   silently no-op. The DB fallback path always runs.
3. **Namespaced keys** — `CacheService.key('authCtx', 'v1', '17682...')` →
   `'authCtx:v1:17682...'`. Prevents accidental cross-tenant reads.

API:

```js
const cache = new CacheService(req.catalystApp);
const cached = await cache.get(key);              // returns parsed value or null
if (cached) { /* hydrate from cache */ return; }

const fresh = await db.query(...);
await cache.set(key, fresh, 1/12);                // TTL in hours (5 min)
// ...later on the write side:
await cache.invalidate(key);
```

---

## Cached call sites

### 1. Unified auth context ⭐ (`AuthMiddleware`)

**This is the only granular auth cache — everything `AuthMiddleware` resolves
goes into ONE key.**

| Field | Value |
|-------|-------|
| **Key** | `authCtx:v1:{userId}` |
| **TTL** | 5 minutes |
| **Stored** | `{ currentUser: {...}, tenantId: '...' }` — the full `req.currentUser` object: id, email, name, role, tenantId, tenantName, tenantSlug, status, avatarUrl, botEnabled, orgRoleId, orgRoleName, orgRolePermissions, moduleAccess, permissions, dataScope |
| **Invalidation** | `OrgRolesController.assignUserOrgRole` and `AdminController.setUserPermissions` clear this key. Role-permission edits rely on the 5-minute TTL (see below for why). |
| **Why** | Read on every authenticated API call. Replaces the 5 DataStore queries that follow the initial user-row lookup. |
| **Benefit** | For a 5-person tenant with each user making 100 API calls/day: roughly **3,000 DB queries/day → 50** (just the misses). |

**Why not invalidate on role-permission edits?** That would require enumerating
every user in the role (extra DB query) plus N invalidation calls (extra
cache cost) — at scale, more expensive than the 5-min wait. Admin perm edits
take up to 5 min to propagate; that's acceptable for an admin action.

### 2. Module visibility map (`AdminController.getModulePermissions`)

| Field | Value |
|-------|-------|
| **Key** | `modules:{tenantId}` |
| **TTL** | 5 minutes |
| **Stored** | `{ projects: bool, daily-work: bool, ..., executive: bool }` |
| **Invalidation** | `AdminController.updateModulePermissions` clears this key |
| **Why** | The frontend's [`useModulePermissions`](../frontend/src/hooks/useModulePermissions.ts) hook calls this endpoint on **every page load** to gate the sidebar. The endpoint is shared across all users of a tenant. |
| **Benefit** | Drops 1 DB query + 1 JSON-parse from the critical-path render. Per-tenant load: O(users × page loads) → O(1 per TTL window). |

### 3. LLM access token (`ai_service/LLMService` — pre-existing)

Listed for completeness. Token is cached for ~55 minutes (Zoho OAuth tokens
expire at 60). Reference implementation that informed the wrapper design.

---

## Cost analysis

Assumptions: 50 active users, each making 100 API calls/day, 20 page loads/day.
~150,000 API calls/month, ~30,000 page loads/month.

### What we'd pay with the naïve "cache every lookup" design

| Op | Calls/month | Beyond free | Cost/month |
|---|---|---|---|
| Gets (6/req in auth + 1/page module) | ~930,000 | 929,000 | ₹2,230 |
| Puts (6/miss × 5,000 misses) | ~30,000 | 25,000 | ₹90 |
| **Total** | | | **~₹2,320/month** |

### What we'll actually pay (cost-optimized unified-cache design)

| Op | Calls/month | Beyond free | Cost/month |
|---|---|---|---|
| Gets (1/req in auth + 1/page module) | ~180,000 | 179,000 | **₹430** |
| Puts (1/miss × ~10,000 misses) | ~10,000 | 5,000 | **₹18** |
| **Total** | | | **~₹448/month** |

**Saving: ~₹1,870/month (80% cheaper)** — same DB-reduction benefit, fraction
of the cache spend.

---

## Invalidation summary

| Endpoint | Cache key cleared |
|---|---|
| `PUT  /api/admin/users/:userId/org-role`        | `authCtx:v1:{userId}` |
| `PUT  /api/admin/users/:userId/permissions`     | `authCtx:v1:{userId}` |
| `PUT  /api/admin/modules`                       | `modules:{tenantId}` |
| `PUT  /api/admin/org-roles/:roleId/permissions` | *(none — relies on 5-min TTL)* |

If a cache write is missed (deploy lag, network hiccup), the TTL is the
safety net — worst case is a 5-min lag before changes appear.

---

## Measured impact (expected)

| Metric | Before cache | After cache |
|---|---|---|
| DataStore reads per authenticated request | 6–7 | 1 (just the user-by-email lookup) on cache hit |
| Warm auth latency | ~600 ms | ~80 ms (1 cache hit, no DB calls) |
| Concurrent burst (10 parallel calls, same user) | 60–70 DB reads | 1 DB read + 9 cache hits |
| `/api/admin/modules` cost | ~200 ms / call | ~30 ms / call when cached |

---

## Failure modes & safety net

- **Cache outage:** every method on `CacheService` swallows the SDK error and
  returns `null` (read) or `false` (write/invalidate). The DB-fallback path
  ALWAYS runs. **The app never fails because the cache is down.**
- **Stale data:** TTL is bounded at 5 min. Even with no invalidation,
  changes propagate within the window.
- **Cross-tenant bleed:** the user-id is part of the key, and the cached
  value includes its own `tenantId` — no chance of a cached entry for
  user A being served to user B even by accident.
- **Schema migrations:** the `v1` segment in the key (`authCtx:v1:...`) lets
  us bust the entire cache by bumping to `v2` in a deploy.

---

## What's NOT cached (and why)

- **The `users` row lookup by email.** Could be cached, but every key would
  contain the user's email (PII in cache). Email lookups are already fast.
- **Catalyst session resolution (`userManagement().getCurrentUser()`).** That's
  Catalyst's own auth call — they manage caching internally.
- **Per-record reads** (a specific task, a specific time entry). These are
  high-churn data and a cache miss is cheap; the cache cost would exceed the
  DB cost.
- **Lists with filters** (e.g. `/tasks?projectId=X&status=Y`). Result set is
  too dynamic; the cache key space would explode.
- **Tenant info as a separate key.** Folded into the unified `authCtx` —
  separating it would double cache gets per request.

---

## Adding new cache call sites

Before adding a new cached call, do the cost math:

1. **How many gets per month?** `requests_per_user × users × days × routes_using_this_value`.
   If > ~1,000/month it'll cost money. Budget accordingly.
2. **Can it fold into an existing cached object?** Reuse `authCtx` if the
   value is per-user. Reuse `modules:{tenantId}` if per-tenant. Adding a new
   key doubles the gets/request.
3. **Pick the longest TTL you can tolerate** — directly reduces puts.
4. **Add a row to "Cached call sites" above** with TTL, invalidation rule,
   and expected benefit.

Template:

```js
const cache  = new CacheService(req.catalystApp);
const key    = `myFeature:v1:${String(scopeId)}`;
const cached = await cache.get(key);
if (cached) return cached;

const fresh = await db.query(...);
await cache.set(key, fresh, 1/12);  // 5 minutes
return fresh;
```

---

## Future work

| Item | Why |
|---|---|
| Replicate `authCtx` caching in other services' AuthMiddleware | Each service has its own copy. Same 1-cache-call-per-request pattern applies. |
| Bump `AUTH_CTX_KEY_VERSION` on deploys that change `req.currentUser` shape | Stale-shape entries would otherwise be served from cache. |
| Surface cache hit/miss rate as a metric | Helps validate the impact numbers in this doc. |
| Extract `CacheService.js` into a shared package | All 11 services duplicate AuthMiddleware. The same `CacheService` should ship there. |
| Periodic free-tier audit | Catalyst free tier is per-month; verify in the console that we're within the budget. |
