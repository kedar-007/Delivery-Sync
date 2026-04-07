# Delivery Sync — Feature Catalogue

A complete reference of every feature developed in the Delivery Sync platform.

---

## Authentication & Session Management

| Feature | Detail |
|---|---|
| Embedded Catalyst SSO | Zoho Catalyst `signIn()` injected into an iframe inside the login page — no redirect to Zoho portal |
| Session resolution | `AuthMiddleware` verifies the Catalyst session cookie on every API request and resolves the DS user from the `users` table |
| Logout | `catalyst.auth.signOut()` clears the SSO cookie, then hard-navigates to `/login`. All localStorage, sessionStorage, cookies, caches, and IndexedDB are cleared first |
| Logged-out flag | `ds_logged_out` persisted in localStorage survives the cross-origin SSO redirect so the app does not re-enter an authenticated state on the way back to `/login` |
| Tenant registration | First user of a new org calls `POST /api/auth/register-tenant` to create a tenant record and become `TENANT_ADMIN` |
| Invite acceptance | Invited users call `POST /api/auth/accept-invite` on first login to activate their pre-created user record |
| SUPER_ADMIN bypass | Users with the Catalyst `SUPER_ADMIN` role bypass tenant checks and land on `/super-admin` |
| Tenant suspension | Suspended/cancelled tenants receive a `TENANT_SUSPENDED` 403 with lock metadata; frontend shows a dedicated `SuspendedScreen` |
| Iframe recursion guard | `index.tsx` renders an empty `<div>` when running inside a Catalyst auth iframe (`window.self !== window.top`) preventing infinite iframe nesting |

---

## Multi-Tenant Architecture

- Each organisation is a **tenant** with a unique `slug` (used as the URL prefix: `/:tenantSlug/…`)
- All data rows are scoped by `tenant_id` — controllers never return data across tenant boundaries
- Role-based access: `TENANT_ADMIN`, `DELIVERY_LEAD`, `TEAM_MEMBER`, `PMO`, `EXEC`, `CLIENT`
- Tenant-level settings stored as JSON in `tenants.settings` (used for lock info, feature flags, etc.)

---

## Projects

- Create, update, archive projects with name, description, start/end dates, RAG status
- RAG status (`RED` / `AMBER` / `GREEN`) with reason — tracked in audit log
- Project members: add/remove team members with role (DELIVERY_LEAD, TECH_LEAD, DEVELOPER, etc.)
- Per-project dashboard: summary of open actions, blockers, upcoming milestones, standup cadence

---

## Milestones

- Create milestones against a project with target date and status (`PENDING` / `IN_PROGRESS` / `COMPLETED` / `DELAYED`)
- Update milestone status; changes logged in audit trail
- Listed in portfolio and project dashboards for timeline visibility

---

## Standups

- Submit daily standup entries per project: *what I did*, *what I'm doing*, *blockers*
- `GET /standups/my-today` — check if the current user has already submitted today
- Rollup view: all team standups aggregated per project for a date range
- Sidebar highlights overdue standup submissions

---

## End-of-Day (EOD) Reports

- Submit EOD entries per project: tasks completed, blockers, notes
- `GET /eod/my-today` — check if EOD was submitted today
- Rollup view per project and date range
- Separate page (`EodPage`) with filtering by project and date

---

## Actions

- Create action items with title, description, priority, due date, assignee, project
- Status workflow: `OPEN` → `IN_PROGRESS` → `DONE` / `CANCELLED`
- Assignee notified via in-app notification and email on creation
- Filter by project, status, assignee
- Overdue actions flagged by cron job and notified to assignee

---

## Blockers

- Raise blockers against a project with severity (`CRITICAL` / `HIGH` / `MEDIUM` / `LOW`)
- Status: `OPEN` → `IN_PROGRESS` → `RESOLVED` / `ESCALATED`
- Escalation: cron job auto-escalates blockers open > 3 days and notifies project leads
- Project leads notified in-app + email when a new blocker is raised

---

## RAID Log

| Item Type | Statuses |
|---|---|
| Risks | `OPEN` / `MITIGATED` / `CLOSED` |
| Issues | `OPEN` / `IN_PROGRESS` / `RESOLVED` / `CLOSED` |
| Assumptions | `VALID` / `INVALID` / `UNDER_REVIEW` |
| Dependencies | `PENDING` / `RESOLVED` / `AT_RISK` |

All four types are managed under `RaidPage`, scoped per project and tenant.

---

## Decisions Log

- Record architectural/business decisions with description, outcome, decision date
- Status: `OPEN` / `IMPLEMENTED` / `REVERSED`
- Linked to a project; searchable and filterable

---

## Teams

- Create teams within a tenant (cross-project groupings)
- Add/remove team members; each member has a team role
- Teams page shows team composition and linked projects

---

## Tasks & Sprint Board

- Full task management per project: title, description, type, priority, assignee, story points
- Status columns: `BACKLOG` / `TODO` / `IN_PROGRESS` / `IN_REVIEW` / `DONE`
- Sprint board (Kanban) — drag-and-drop tasks between columns (dnd-kit)
- Backlog page: manage unsprintered tasks, bulk assign to sprint
- Sprint management: create sprints with start/end date, activate, complete
- Task comments thread
- Task status history log
- `MyTasksPage` — personal view of tasks assigned to the current user

---

## Time Tracking

- Log time entries against tasks/projects with date, hours, description
- Submit entries for approval; leads can approve or reject
- Approval request workflow with notifications
- Export jobs for time reports

---

## People Module

### Attendance
- Record clock-in/clock-out; attendance policies per tenant
- Anomaly detection notified to admin
- `ATTENDANCE_ADMIN` role can view and override

### Leave Management
- Leave types and balances per user
- Submit leave requests; leads/admin approve or reject
- Leave calendar view
- Notifications: `LEAVE_APPROVAL_NEEDED`, `LEAVE_APPROVED`, `LEAVE_REJECTED`
- Leave balance tracked and auto-decremented on approval

### Org Chart & Directory
- Visual org chart (`OrgChartPage`) rendered from team hierarchy
- Employee directory (`DirectoryPage`) with search, role and team filters

### Announcements
- Publish company-wide announcements with read-receipt tracking (`announcement_reads`)
- `ANNOUNCEMENT_PUBLISHED` notification pushed to all tenant users

### User Profiles
- Extended profile per user (bio, skills, social links) in `user_profiles` table
- Avatar URL stored in `users` table (handles both `avatar_url` and legacy `avtar_url` column)

---

## Asset Management

- Asset categories and individual asset records
- Asset request workflow: submit → approve/reject → assign
- Maintenance scheduling with due-date notifications
- Roles: `ASSET_READ`, `ASSET_WRITE`, `ASSET_ASSIGN`, `ASSET_APPROVE`, `ASSET_ADMIN`

---

## Badges & Recognition

- Define badge types in `badge_definitions`
- Award badges to users; `BADGE_AWARDED` notification sent
- Badge history per user in `user_badges`

---

## Notifications

- **In-app notifications**: stored in `notifications` table, polled/displayed in the sidebar bell
- **Email notifications**: sent via Catalyst Mail SDK for key events
- Per-user notification preferences in `notification_preferences`
- Notification types cover: standups, EOD, actions, blockers, tasks, sprints, time, leave, assets, badges, announcements
- `GET /api/notifications` returns unread count + list for the current user

---

## Reports

- Generate weekly, monthly, custom reports per project
- Report types: `USER_PERFORMANCE`, `TEAM_PERFORMANCE`, `DAILY_SUMMARY`, `PROJECT_SUMMARY`
- Report exports stored in `report_exports`; shareable via `ReportDetailPage` (public route — no auth required)
- `EnterpriseReportsPage` for org-wide aggregated views

---

## AI Insights

- `AiInsightsPage` with AI-generated performance analysis
- `CeoDashboardPage` and `CtoDashboardPage` for executive-level AI summaries
- Backend AI service reads standup/EOD/action/blocker data and generates structured insights

---

## Dashboards

| Dashboard | Audience |
|---|---|
| `DashboardPage` | All users — personal activity + project health |
| `PortfolioDashboard` | PMO/Admin — all projects RAG summary |
| `CeoDashboardPage` | EXEC — org-level KPIs |
| `CtoDashboardPage` | EXEC — engineering health metrics |
| Project Dashboard | Per-project summary via `GET /api/dashboard/project/:id` |

---

## Admin

- `AdminPage`: invite users, manage roles, deactivate accounts
- `AdminConfigPage`: workflow configs, form configs, feature flags, permission overrides, notification preferences
- `SuperAdminPage`: cross-tenant management (suspend, cancel, view all tenants) — accessible only to `SUPER_ADMIN` role

---

## Cron Jobs

- **Blocker escalation**: auto-escalates open blockers older than 3 days
- **Standup/EOD reminders**: sends reminders to users who haven't submitted by a configured time
- **Action overdue**: notifies assignees of overdue actions
- **Daily summary**: generates and distributes daily digest
- Cron routes protected by `x-zoho-catalyst-is-cron: true` header

---

## Audit Log

Every create/update/delete/status-change across all core entities (projects, milestones, actions, blockers, RAID, decisions, tasks, assets, badges) is recorded in `audit_logs` with `entity_type`, `entity_id`, `action`, `old_value`, `new_value`, `performed_by`, and timestamp.

---

## Role Permissions Matrix (summary)

| Role | Key Capabilities |
|---|---|
| `TENANT_ADMIN` | Full access to all features |
| `DELIVERY_LEAD` | Full delivery + time approve + leave approve + badge award |
| `PMO` | Full delivery + attendance admin + leave admin + asset admin + badge write |
| `TEAM_MEMBER` | Submit standups/EOD, manage own tasks/actions/blockers, self-service leave/time |
| `EXEC` | Read-only access to all modules for reporting |
| `CLIENT` | Read-only: projects, milestones, reports, dashboard |
| `SUPER_ADMIN` | Cross-tenant: suspend/cancel tenants, platform administration |
