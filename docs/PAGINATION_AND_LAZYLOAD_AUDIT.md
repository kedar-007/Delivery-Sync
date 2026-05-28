# Pagination & Lazy Loading Audit

**Date:** 2026-05-28  
**Constraint:** Zoho Catalyst ZCQL hard-caps `LIMIT` at **300 rows**. Any query that sends `LIMIT > 300` throws a runtime error and breaks the endpoint entirely.

---

## Quick Summary

| Risk | Module / Endpoint | Problem | Fix Needed |
|------|-------------------|---------|------------|
| 🔴 CRITICAL | `OrgRolesController` — `/admin/org-roles`, `/admin/sharing-rules`, user-role listings | 6+ raw `LIMIT 300` queries, no pagination, no offset loop | Replace with `findPaginated()` |
| 🔴 CRITICAL | `AssetRequestController` — `/asset-requests` | `LIMIT 300` for ops-team user lookups; `LIMIT 300` for users listing | Replace with `fetchAll()` or `findPaginated()` |
| 🟠 HIGH | `people_service / OrgController` — `/org/directory` | Hard-fetches all users + profiles at `LIMIT 200`, no pagination | Add server-side pagination |
| 🟠 HIGH | `people_service / AnnouncementController` — `/announcements` | Fetches all 200 announcements + all 200 users in a single call | Add pagination + separate user fetch |
| 🟠 HIGH | `people_service / LeaveController` — `/leaves/requests` | Fixed `limit: 100` on leave requests list; fixed `limit: 200` for all-users join | Add `findPaginated()` |
| 🟠 HIGH | `task_sprint_service / SprintController` — `/sprints` | `LIMIT 300` on sprint listing with no offset | Add `findPaginated()` |
| 🟡 MEDIUM | `time_tracking_service / TimeController` — `/time/report` | `limit: 200` for time entries; report endpoint fetches all 200 users + 200 projects in one shot | Add pagination to report |
| 🟡 MEDIUM | `reporting_service / ReportController` — all report endpoints | Already uses `fetchAll()` correctly, but no user-facing page controls | Already safe; add UI progress indicator |
| 🟡 MEDIUM | `people_service / CronController` — auto-checkout & leave-accrual crons | Uses `LIMIT 300 OFFSET` loops — correct pattern, but loop uses exact 300 so boundary edge hits Catalyst cap | Change page size to 200 |
| 🟢 OK | `delivery_sync_function` — standups, EOD, actions, blockers, RAID, decisions, audit logs, projects | All use `findPaginated()` with page/pageSize params | Nothing needed |
| 🟢 OK | `bug_service` | Has `_fetchAllPaginated()` helper using `LIMIT <offset>, <pageSize>` Catalyst syntax | Nothing needed |
| 🟢 OK | `SuperAdminController` | Explicitly caps all queries at 200 via `const ZCQL_MAX = 200` | Nothing needed |

---

## 1. Backend — Detailed Findings

### 1.1 `delivery_sync_function / OrgRolesController` 🔴 CRITICAL

**File:** `functions/delivery_sync_function/src/controllers/OrgRolesController.js`

| Line | Query | Risk |
|------|-------|------|
| 174 | `WHERE org_role_id = '...' AND is_active = 'true' LIMIT 300` | Orgs with 300+ role-user mappings → silent truncation now, crash if ever pushes to 301 |
| 526 | `SELECT * FROM org_roles WHERE tenant_id = '...' LIMIT 300` | 300+ org roles → silently drops roles beyond 300 |
| 534 | Same query for nested tenant in org hierarchy | Same |
| 553 | `WHERE org_role_id IN (...) LIMIT 300` | Cross-role user lookup capped at 300 |
| 567 | `SELECT org_role_id FROM user_org_roles WHERE ... LIMIT 300` | 300+ role assignments → incomplete RBAC resolution |
| 573 | Same for nested tenant | Same |
| 594 | `WHERE org_role_id IN (...) AND is_active != 'false' LIMIT 300` | Same |
| 601 | `SELECT ROWID, name, avatar_url FROM users WHERE ROWID IN (...) LIMIT 300` | User lookup capped at 300 |

**Why this breaks:** An enterprise tenant with 300 active users each having one org role would have exactly 300 `user_org_roles` rows. Adding one more user hits the cap. All role-dependent permission checks in the app would return incomplete data.

**Fix:** Replace all list queries with `findPaginated()` or `fetchAll()`. The `user_org_roles` read is especially critical — it feeds RBAC resolution, so `fetchAll()` (which auto-paginates) is the right method here.

---

### 1.2 `asset_service / AssetRequestController` 🔴 CRITICAL

**File:** `functions/asset_service/src/controllers/AssetRequestController.js`

| Line | Query | Risk |
|------|-------|------|
| 114 | `SELECT ROWID, name, email, avatar_url FROM users WHERE ROWID IN (...) LIMIT 300` | User enrichment for request list capped at 300 |
| 287 | `SELECT user_id FROM user_org_roles WHERE org_role_id IN (...) AND is_active = 'true' LIMIT 300` | Ops-team members fetched to notify on request approval — 300+ ops staff → notifications silently dropped |
| 401 | Same query again for a different request flow | Same |
| 913 | `SELECT ROWID, name, email, avatar_url FROM users WHERE tenant_id = '...' AND status = 'ACTIVE' ORDER BY name ASC LIMIT 300` | Full active-user list for assignment dropdown — hard capped at 300 |

**Why this breaks:** The 300-user dropdown cap means any org with 300+ active users gets a truncated picker. The notification path (lines 287, 401) would silently skip ops staff beyond position 300.

**Fix:** Line 913 (full user list) → use `fetchAll()` or add server-side search. Lines 287/401 (org-role lookups) → use `fetchAll()` since all matched users must receive notifications.

---

### 1.3 `people_service / OrgController` 🟠 HIGH

**File:** `functions/people_service/src/controllers/OrgController.js`

| Line | Call | Table | Limit | Risk |
|------|------|-------|-------|------|
| 17 | `findAll(USERS, { tenant_id }, { limit: 200 })` | users | 200 | 200+ users → directory is silently incomplete |
| 18 | `findWhere(USER_PROFILES, tenantId, '', { limit: 200 })` | user_profiles | 200 | Profile data missing for users 201+ |
| 54 | `findAll(USERS, { tenant_id }, { limit: 200 })` | users | 200 | Reporter/manager lookups truncated |

**Why this breaks:** The org directory page will render silently incomplete data. A 250-person team will show 200 people in the directory with no indication that 50 are missing.

**Fix:** These endpoints power the directory page. They need `findPaginated()` with page/pageSize params passed from the frontend.

---

### 1.4 `people_service / AnnouncementController` 🟠 HIGH

**File:** `functions/people_service/src/controllers/AnnouncementController.js`

| Line | Call | Table | Limit | Risk |
|------|------|-------|-------|------|
| 21 | `findWhere(ANNOUNCEMENTS, tenantId, ...)` | announcements | 200 (default) | Old announcements beyond 200 disappear |
| 47 | `findAll(USERS, { tenant_id }, { limit: 200 })` | users | 200 | "Read by" count is incomplete for orgs with 200+ users |

**Why this breaks:** An organization posting announcements regularly will accumulate 200+ announcements within 1–2 years. Older announcements become unreachable with no error shown.

**Fix:** Add `findPaginated()` on announcements. The all-users fetch for the "read-by" feature should use `countWhere()` instead of loading every user row.

---

### 1.5 `people_service / LeaveController` 🟠 HIGH

**File:** `functions/people_service/src/controllers/LeaveController.js`

| Line | Call | Table | Limit | Risk |
|------|------|-------|-------|------|
| 280 | `findWhere(LEAVE_REQUESTS, tenantId, where, { limit: 100 })` | leave_requests | 100 | Admin list view silently drops requests beyond 100 |
| 283 | `findAll(USERS, { tenant_id }, { limit: 200 })` | users | 200 | User enrichment truncated at 200 |

**Why this breaks:** An org with 50 employees each submitting 3 leave requests per year hits the 150-request threshold in year 1. HR admins reviewing the leave list will silently miss requests. This is compliance-critical — missed leave requests could result in unprocessed approvals.

**Fix:** Replace with `findPaginated()` and pass `page`/`pageSize` from frontend. Separate the user-enrichment into a join or targeted lookup rather than loading all users.

---

### 1.6 `task_sprint_service / SprintController` 🟠 HIGH

**File:** `functions/task_sprint_service/src/controllers/SprintController.js`

| Pattern | Risk |
|---------|------|
| `findWhere(SPRINTS, tenantId, where, { limit: 300 })` | Project with 300+ sprints (possible in long-running products) → crash |

**Why this breaks:** Using exactly `LIMIT 300` is the worst case — this is Catalyst's hard cap. Any project that has had 300 sprints (roughly 6 years of weekly sprints) will cause a thrown error, not silent truncation.

**Fix:** Change to `findPaginated()` with e.g. `pageSize: 20`. Sprint list is almost always viewed as a summary table — showing 20 per page is appropriate UX.

---

### 1.7 `time_tracking_service / TimeController` 🟡 MEDIUM

**File:** `functions/time_tracking_service/src/controllers/TimeController.js`

| Line | Call | Table | Limit | Risk |
|------|------|-------|-------|------|
| 212 | `findWhere(TIME_ENTRIES, tenantId, where, { limit: 200 })` | time_entries | 200 | Admin report view silently truncated |
| 536 | `findAll(USERS, { tenant_id }, { limit: 200 })` | users | 200 | User dropdown for time entry filtered at 200 |
| 537 | `findAll(PROJECTS, { tenant_id }, { limit: 200 })` | projects | 200 | Project dropdown for time entry capped at 200 |

**Why this breaks:** Time entries grow quickly. A 10-person team logging daily generates 200+ entries per month. The report view will silently miss data. Also, an org with 200+ projects won't see all projects in the time-entry form.

**Fix:** `TIME_ENTRIES` needs `findPaginated()` on the report endpoint (page/date-range params). `USERS` and `PROJECTS` dropdowns should use `fetchAll()` since they need the complete list for the form.

---

### 1.8 `people_service / CronController` 🟡 MEDIUM (Edge Case)

**File:** `functions/people_service/src/controllers/CronController.js`

| Lines | Pattern | Risk |
|-------|---------|------|
| 28, 126 | `LIMIT 300 OFFSET ${_offset}` loop | If a batch returns exactly 300 rows, the loop requests `LIMIT 300` again. If that second batch is also exactly 300, it hits the cap and throws. |

**Why this breaks:** `fetchAll()` in `DataStoreService` uses `if (page.length < 300) break` — this means a batch of exactly 300 triggers another page, which is correct. But if the final page contains exactly 300 rows, the loop does one extra query returning 0 rows and exits. This is fine. The real risk is if the data is exactly a multiple of 300 — e.g. exactly 600 users. The 3rd query requests LIMIT 300 at OFFSET 600 and Catalyst may return an empty set correctly, or may error. **Reduce page size to 200 to be safe.**

**Fix:** Change `LIMIT 300` to `LIMIT 200` in all cron pagination loops. `DataStoreService.fetchAll()` already uses 300 — it should be changed to 250 to add a safety margin.

---

### 1.9 DataStoreService `fetchAll()` Safety Margin 🟡 MEDIUM

**File:** `functions/delivery_sync_function/src/services/DataStoreService.js` — Line 127

```js
// Current (risky):
`SELECT * FROM ${tableName} WHERE ${fullWhere} ${orderStr} LIMIT 300 OFFSET ${offset}`
if (page.length < 300) break;
```

Using exactly 300 as the sentinel means any table that grows to an exact multiple of 300 rows will issue one extra query. This is fine for correctness but wastes a round trip. More critically, `LIMIT 300` is Catalyst's maximum — one off-by-one error in future code could exceed it.

**Fix:** Change `LIMIT 300` to `LIMIT 200` and the sentinel to `< 200` in all `fetchAll()` implementations across all four function `DataStoreService.js` files.

---

## 2. Frontend — Lazy Loading & Pagination Audit

### Already Implemented ✅

| Page | File | Mechanism |
|------|------|-----------|
| Projects | `ProjectsPage.tsx:58` | Server-side pagination via `page`/`pageSize` params; `<Pagination>` component |
| Audit Logs | `AuditLogsPage.tsx:387` | Server-side pagination, full prev/next/numbered controls |
| Time Tracking (My Log) | `TimeTrackingPage.tsx:577` | Server-side pagination with `pageSize` selector (5/10/25/50) |
| Bug Reports | `BugReportsPage.tsx:884` | Client-side pagination (loads all bugs, slices locally) |
| Super Admin — audit tab | `SuperAdminPage.tsx:2024` | Client-side pagination |

### Missing Pagination ❌

#### `DirectoryPage.tsx` (People / Org Directory)
- **What it does:** Renders a card grid of all org members.
- **Data source:** `people_service / OrgController` which fetches `LIMIT 200` users.
- **Risk:** Silent truncation at 200 users. No pagination UI. No "showing X of Y" indicator.
- **Fix needed:** 
  1. Backend: convert `OrgController.directory()` to `findPaginated()`.
  2. Frontend: add page controls or infinite scroll to `DirectoryPage`.

#### `LeavePage.tsx` — Leave Requests Admin View
- **What it does:** Admin tab shows all leave requests for the org.
- **Data source:** `LeaveController` with hard `limit: 100`.
- **Risk:** Admins see at most 100 leave requests. In orgs with active request history this is hit within months.
- **Note:** The team planning calendar tab has client-side pagination (`listPage`, `PLAN_PAGE_SIZE`) but this only slices the already-truncated 100-row response.
- **Fix needed:**
  1. Backend: `findPaginated()` on `LeaveController.list()`.
  2. Frontend: replace client-side slice with proper server-side `page`/`pageSize` params.

#### `AssetManagementPage.tsx`
- **What it does:** Inventory table, assignment history, asset request queue.
- **Data source:** `AssetController` at `limit: 200`; `AssignmentController` at `limit: 100`.
- **Risk:** Orgs with 200+ physical assets see a truncated inventory silently. Request queue capped at 100.
- **Fix needed:**
  1. Backend: Add `findPaginated()` to `AssetController.list()` and `AssetRequestController.list()`.
  2. Frontend: Add pagination controls to the inventory table and request queue tab.

#### `AnnouncementsPage.tsx`
- **What it does:** List of company announcements.
- **Data source:** `AnnouncementController` at default `LIMIT 200`.
- **Risk:** Org with monthly announcements will lose history after 200 posts (~16 years, so low urgency but still worth fixing before it becomes an issue).
- **Fix needed:** Server-side pagination with oldest-first or date-range filter.

#### `SprintsPage.tsx`
- **What it does:** Lists all sprints for a project.
- **Data source:** `SprintController` at `LIMIT 300`.
- **Risk:** `LIMIT 300` is Catalyst's hard cap — a project with exactly 300 sprints will cause a thrown error and the page will fail to load entirely.
- **Fix needed:**
  1. Backend: `findPaginated()` on `SprintController.list()`.
  2. Frontend: Add pagination controls. Realistically a user rarely needs to browse more than 20 sprints at once.

#### `TeamsPage.tsx`
- **What it does:** Lists all teams and their members.
- **Data source:** `TeamController` (limit not audited but uses standard `findWhere` defaults = 200).
- **Risk:** Orgs with 200+ teams silently truncated.
- **Fix needed:** Verify and add `findPaginated()` + frontend pagination.

#### `AttendancePage.tsx`
- **What it does:** Attendance records grid.
- **Data source:** `people_service` attendance controller (default `LIMIT 200`).
- **Risk:** Monthly attendance records for a 10-person team = ~220 records/month. After the first month of use, the table is already truncated.
- **Fix needed:** This is the most time-sensitive missing pagination. Add date-range filtering + `findPaginated()` server side. Show a date window (e.g. current month) by default.

---

## 3. Lazy Loading — Frontend Components

### Current approach: Eager Load Everything

Almost all data-heavy components use this pattern:
```ts
const { data } = useQuery(['key'], () => api.list())
// renders all rows in a table immediately
```

There is no virtualized list (e.g. `react-window`, `tanstack-virtual`) anywhere in the codebase. For tables with 50–200 rows this is fine. But:

### Components that need virtualisation or lazy load as data grows

| Component | File | Current rows | Risk threshold | Recommendation |
|-----------|------|-------------|----------------|---------------|
| Directory grid | `DirectoryPage.tsx` | ~200 | 500+ people-cards → heavy DOM | Add `IntersectionObserver`-based infinite scroll |
| Sprint board | `SprintBoardPage.tsx` | ~50 tasks | 300 tasks per sprint → cards lag | Virtualise the task card column with `@tanstack/react-virtual` |
| Asset inventory table | `AssetManagementPage.tsx` | ~200 rows | 500+ assets → scroll lag | Add virtualised rows |
| Announcements feed | `AnnouncementsPage.tsx` | ~200 items | — | IntersectionObserver load-on-scroll |
| Audit log timeline | `AuditLogsPage.tsx` | Already paginated | — | Already good |

---

## 4. Recommended Priority Order

```
Sprint 1 — Critical (data integrity / crash risk)
  1. OrgRolesController — replace all LIMIT 300 with fetchAll() / findPaginated()
  2. AssetRequestController — fix ops-team user lookup and user dropdown
  3. SprintController — change LIMIT 300 to findPaginated()
  4. DataStoreService fetchAll() — reduce page size from 300 → 200 in all function directories

Sprint 2 — High (silent data loss)
  5. OrgController / DirectoryPage — paginated directory
  6. LeaveController / LeavePage — paginated leave request admin view
  7. AttendancePage — date-windowed + paginated records (most time-sensitive due to daily growth)
  8. AssetController / AssetManagementPage — paginated inventory + requests

Sprint 3 — Medium (future-proofing)
  9. AnnouncementController / AnnouncementsPage — pagination
  10. TimeController report endpoint — paginated time entry report
  11. CronController loops — change LIMIT 300 → LIMIT 200
  12. TeamsPage — verify and add pagination
```

---

## 5. Pattern Reference

All necessary infrastructure already exists in `DataStoreService.js`:

```js
// For complete data needed in memory (e.g. RBAC lookups, notification targets):
const allRows = await this.db.fetchAll(TABLE, tenantId, whereExtra);

// For user-facing list endpoints (tables, grids):
const { rows, total, page, pageSize, totalPages } =
  await this.db.findPaginated(TABLE, tenantId, whereExtra, {
    page: req.query.page,
    pageSize: req.query.pageSize,
    orderBy: 'CREATEDTIME DESC',
  });

// Frontend hook pattern (already used in ProjectsPage / AuditLogsPage):
const [page, setPage] = useState(1);
const { data } = useQuery(['key', page], () => api.list({ page, pageSize: 20 }));
// data.rows → render; data.totalPages → <Pagination> component
```

The `<Pagination>` component already exists in `frontend/src/pages/ProjectsPage.tsx` and can be extracted to `frontend/src/components/ui/Pagination.tsx` for reuse across all pages.
