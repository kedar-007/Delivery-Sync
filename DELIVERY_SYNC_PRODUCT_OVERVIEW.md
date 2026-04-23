# Delivery Sync — Product Overview
### Senior Presentation Reference Guide

---

## What Is Delivery Sync?

**Delivery Sync** is an internal project delivery and team management platform built for software delivery organisations. It replaces scattered spreadsheets, Slack threads, and manual reporting with a single workspace that keeps delivery leads, team members, PMOs, and executives aligned in real time.

The platform has three surfaces:
- **Web App** — full-featured dashboard for leads, admins, and office users
- **Mobile App** (Flutter — iOS & Android) — optimised for team members on the move
- **Backend** — Zoho Catalyst serverless functions (Node.js), Firestore data store, Catalyst SSO

---

## Core Feature Areas

### 1. Authentication & Access Control

**How it works:**
- Login is handled by **Zoho Catalyst SSO** — users enter their email and password on a Catalyst-hosted screen embedded in the app. No passwords are stored by the application.
- After login the app checks whether the user's account is active. If an admin has deactivated the account, the user sees a custom **Access Revoked** page explaining the situation and hinting to contact an admin — they cannot access any part of the app.
- Sessions are maintained via Catalyst-issued cookies; no JWTs are managed by the app layer.

**Role-Based Access Control (RBAC):**
The system uses two orthogonal concepts:

| Concept | Values | Purpose |
|---------|--------|---------|
| **System Role** | `TEAM_MEMBER`, `TENANT_ADMIN` | Coarse Catalyst-level gate |
| **Org Role** | `DELIVERY_LEAD`, `PMO`, `EXEC`, `CLIENT`, `Frontend Engineer`, `QA Lead`, … | Fine-grained permissions within the app |
| **Permission** | `PROJECT_READ`, `ADMIN_WRITE`, `DATA_SEED`, `AI_PERFORMANCE`, … | Feature-level gate |
| **Data Scope** | `OWN_DATA`, `ROLE_PEERS`, `SUBORDINATES`, `ORG_WIDE` | What data the role can see |

Key rule: **permission checks always use org roles and explicit permission grants, never raw system role strings.** An `ORG_ROLE_READ` permission does not elevate a user's data scope to `ORG_WIDE`.

---

### 2. Dashboard

The landing page after login. Gives an at-a-glance view of the organisation's delivery health.

**What it shows:**
- **Active Projects** count — projects not yet completed
- **Team Attendance** — how many team members have submitted standup today
- **Critical Blockers** — count of open P1 blockers across all projects
- **Upcoming Milestones** — next 3–5 milestone due dates
- **Recent Activity** feed — latest standups, EODs, and actions created

**Who sees what:** Data scope rules apply. A `TEAM_MEMBER` with `OWN_DATA` scope sees only their projects. A `PMO` with `ORG_WIDE` scope sees the full organisation.

---

### 3. Projects

The central hub for managing delivery work.

**Project list:**
- Grid of project cards showing name, RAG status (Red / Amber / Green), lead, and team size
- Clickable cards open the project detail page

**Project detail page — sub-sections:**

| Tab | Purpose |
|-----|---------|
| **Tasks** | Individual work items with assignee, due date, status, priority |
| **Sprint Board** | Kanban view of current sprint tasks (To Do → In Progress → Done) |
| **Backlog** | Un-sprinted tasks, grooming queue |
| **Actions** | Follow-up items from meetings/standups with owner and due date |
| **Blockers** | Items preventing progress, with priority (P1 critical → P3 low) and status |
| **Milestones** | Key delivery dates and phase gates |

**RAG Status:**
Each project has a Red/Amber/Green indicator. The delivery lead selects it via a modal that also captures a reason note. Visible on the dashboard and in reports.

**Member management:**
Leads can add or remove project members. The remove action uses a confirmation dialog to prevent accidental removal.

---

### 4. Standup

Daily async standup — eliminates stand-up meetings.

**Submission flow:**
1. Team member opens Standup (web or mobile)
2. Fills in: *What I did yesterday*, *What I'm doing today*, *Any blockers?*
3. Submits — entry stamped with timestamp and linked to their org profile

**Team view (leads):**
- See all team member submissions for any given day
- Filter by project or date
- Members who haven't submitted yet are flagged

---

### 5. EOD (End of Day)

An end-of-day reflection log submitted by team members.

- Records what was completed, hours spent per project (links to time tracking), and any notes
- Managers see a rolled-up view of team EODs for the day
- History browseable per team member

---

### 6. Time Tracking

Purpose-built time logging — not a generic timer tool.

**How it works for team members:**
- "Log Time" opens a modal: select project, task, date, hours, and a brief note
- Entries start in **Saved** (draft) state
- Member submits entries for approval → status moves to **Submitted**
- If corrections needed: member can **Retract** a submission (returns to draft)
- Approval flow: approver reviews and **Approves** or **Rejects**

**Tabs in Time Tracking:**
| Tab | Who sees it | Purpose |
|-----|-------------|---------|
| My Time Log | All | Own entries: log, edit, delete (draft), submit, retract |
| Analytics | Leads/PMO | Charts: hours by project, by person, utilisation trends |
| Approvals | Approvers | Queue of submitted entries awaiting review |

**Guard rails:**
- Deleting a time entry (draft only) shows a ConfirmDialog before permanent deletion
- Retracting a submitted entry shows a ConfirmDialog before moving back to draft

---

### 7. AI Insights

Powered by an LLM (configured via Catalyst's AI service).

**Sections:**

| Section | What it does |
|---------|-------------|
| **Performance Analysis** | Analyses a team member's standup and EOD history, surfaces patterns (e.g. recurring blockers, velocity dips), generates a natural-language performance summary |
| **Team Analysis** | Aggregates team-level signals: attendance rate, blocker frequency, sprint completion rate — surfaces risks to the delivery lead |
| **Project Health** | Cross-project comparison; flags projects trending amber/red with AI-generated narrative |

**Gated by permissions:** `AI_PERFORMANCE` to see personal cards; `AI_TEAM_ANALYSIS` to see team-level analysis. A user can have one without the other.

---

### 8. People & Directory

**People page:**
- Grid/list of all team members across the organisation
- Shows: name, org role, avatar, active/inactive status
- Search and filter by department or role
- Clicking a person opens their profile (read-only for non-admins)

**Data scope applies:** `OWN_DATA` users see only their immediate team peers; `ORG_WIDE` roles see everyone.

---

### 9. Profile

Each user has an editable profile.

**What's on the profile page:**
- Full name (editable)
- Avatar / profile photo
- **Org role badge** — e.g. "Frontend Engineer", "QA Lead" — shown as a coloured pill. This is the business role, not the Catalyst system role.
- Contact info
- Leave balance summary (links to Leave module)
- Recent activity (last 5 standups / EODs)

> **Note:** The old "system role badge" (TEAM_MEMBER / TENANT_ADMIN gradient badge) was removed. Only the org role is shown — it's more meaningful to the user and avoids exposing internal RBAC terminology.

---

### 10. Admin — User Management

Accessible only to `TENANT_ADMIN` system role (or users with explicit `ADMIN_WRITE` permission).

**Capabilities:**
- View all users in the tenant with their name, email, org role, status (Active/Inactive)
- **Deactivate** a user: triggers ConfirmDialog → user loses app access immediately; they see the Access Revoked page on next visit
- **Activate** a deactivated user: same flow with ConfirmDialog
- **Edit Roles**: opens a modal to change a user's org role and permission set
- Deactivate/Activate buttons are mutually exclusive per row (active users show Deactivate; inactive show Activate)

---

### 11. Admin Config

Tenant-wide configuration panel for admins.

**Sections (left-side navigation):**

| Section | What you configure |
|---------|-------------------|
| **Workflows** | Approval chains, notification triggers |
| **Feature Flags** | Enable/disable modules per tenant (e.g. hide Time Tracking for a client) |
| **Org Roles** | Define org roles (e.g. "QA Lead"), assign permissions and data scope |
| **Org Sharing Rules** | Set data scope per org role (OWN_DATA, ROLE_PEERS, ORG_WIDE, SUBORDINATES) |
| **IP Whitelist** | Restrict access to specific IP ranges |
| **Seed Demo Data** | Inserts realistic demo projects, users, standups, and time entries for onboarding or demos — protected by ConfirmDialog |

---

### 12. Leave Management

Tracks leave requests and balances.

- Team members submit leave requests with type (Annual, Sick, WFH), dates, and reason
- Approvers with `LEAVE_APPROVE` permission review and approve/reject
- Leave balance is tracked per user; only `LEAVE_MANAGE` can adjust balances
- Calendar view shows team leave overlaps

---

### 13. Assets

Tracks physical and digital assets assigned to team members.

- Asset catalogue with type, serial number, assigned user, status
- `ASSET_ASSIGN` permission: assign or return assets
- `ASSET_MANAGE` permission: create, retire, or dispose of assets
- History trail per asset

---

### 14. Reports

On-demand reports exportable as PDF or viewed in-app.

**Available reports:**
- **Project Status Report** — RAG, milestones, open blockers, team roster
- **Attendance/Standup Report** — daily submission rates per team
- **Time Report** — hours logged per person / project / period
- **Leave Report** — leave taken vs. balance, by team or org

Access gated by `REPORT_READ` permission; data scope applies (leads see team reports, PMO sees org-wide).

---

### 15. Mobile App (Flutter)

Feature-parity with the web app for the most common daily actions:

| Feature | Mobile |
|---------|--------|
| Standup submission | ✅ |
| EOD submission | ✅ |
| Dashboard summary | ✅ |
| Project list & detail | ✅ |
| People directory | ✅ |
| Profile view & edit | ✅ |
| AI Insights | ✅ |
| Admin panel | ✅ |
| Time tracking | ✅ |

**Light and dark mode** supported. A recent fix addressed contrast issues with standup/EOD history text in light mode.

---

## How the Data Flows

```
User action (web/mobile)
        │
        ▼
Zoho Catalyst Function (Node.js)
   ├── AuthMiddleware   → validates Catalyst session cookie
   ├── RBACMiddleware   → checks org role + permission + data scope
   └── Controller       → business logic
        │
        ▼
   Firestore (NoSQL document store)
        │
        ▼
   Response → Frontend
```

All API calls go through the same auth + RBAC middleware stack. There is no way to bypass permission checks at the client.

---

## Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| Zoho Catalyst SSO | No password storage, compliance-friendly, single login across Catalyst-hosted tools |
| Org roles over system roles | System roles (TEAM_MEMBER/TENANT_ADMIN) are binary; org roles model real job functions and can carry custom permissions |
| Data scope as a separate axis | Prevents accidental data leaks when new permissions are added — scope is always explicit |
| Custom ConfirmDialog (no window.confirm) | Native browser dialogs can't be styled, tested, or keyboard-navigated consistently. Custom dialog has proper ARIA attributes, variant styling (danger = red, warning = amber), and is fully automatable in E2E tests |
| Serverless (Catalyst Functions) | No infrastructure to manage; scales to zero for low-traffic tenants; all functions share the same Firestore instance under tenant isolation |

---

## Test Coverage

The platform has a full Playwright E2E test suite (`frontend/tests/e2e/`) that runs against the live dev server using a saved auth session. Test suites cover:

- Navigation (all 24 routes load without crash)
- Dashboard stat cards render
- ConfirmDialog replaces all `window.confirm` calls
- Project list, detail, RAG modal, member management
- Admin user management (deactivate, activate, edit roles)
- Admin config (Seed Demo Data dialog)
- Profile page (org role badge present, system role badge absent)
- Time tracking (Log Time modal, delete/retract confirmation)

Manual regression test cases are tracked in `TEST_CASES.csv` (576 cases across 30 modules).

---

## Glossary

| Term | Meaning |
|------|---------|
| **RAG Status** | Red / Amber / Green project health indicator |
| **Standup** | Daily async written update from each team member |
| **EOD** | End-of-Day log — summary of what was completed |
| **Org Role** | Business role within the organisation (e.g. "Frontend Engineer") |
| **System Role** | Catalyst-level coarse role: `TEAM_MEMBER` or `TENANT_ADMIN` |
| **Data Scope** | What data a role can see: OWN_DATA, ROLE_PEERS, SUBORDINATES, ORG_WIDE |
| **ConfirmDialog** | Custom modal used for all destructive/irreversible actions |
| **Catalyst** | Zoho's serverless platform hosting both the backend functions and the SSO |
| **Tenant** | A single organisation using the platform (identified by a slug, e.g. `fristine-tech`) |
