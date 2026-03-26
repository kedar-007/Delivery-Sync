# Delivery Sync — Deployment Guide

## Prerequisites

- [Zoho Catalyst CLI](https://catalyst.zoho.com/help/cli.html) installed and logged in
- Node.js 18+
- A Zoho Catalyst project already created (or create one via CLI)

---

## 1. DataStore — Table Setup

Go to **Catalyst Console → DataStore → Tables** and create the following tables manually. All columns are of type **Text** unless noted. Catalyst auto-creates `ROWID`, `CREATEDTIME`, and `MODIFIEDTIME` on every table.

### Table: `tasks`
| Column | Type | Notes |
|---|---|---|
| `tenant_id` | Text | FK → tenants.ROWID |
| `project_id` | Text | FK → projects.ROWID |
| `sprint_id` | Text | FK → sprints.ROWID (0 = backlog) |
| `parent_task_id` | Text | Parent task ROWID (0 = top-level) |
| `title` | Text | Task title |
| `description` | Text | Detailed description |
| `type` | Text | `TASK`, `STORY`, `BUG`, `SUBTASK`, `EPIC` |
| `status` | Text | `TODO`, `IN_PROGRESS`, `IN_REVIEW`, `DONE`, `CANCELLED` |
| `task_priority` | Text | `CRITICAL`, `HIGH`, `MEDIUM`, `LOW` — note: `priority` is a ZCQL reserved word |
| `assignee_id` | Text | Primary assignee user ROWID |
| `assignee_ids` | Text | **Add this column** — JSON array of all assignee ROWIDs e.g. `["123","456"]` — required for multi-assignee |
| `reporter_id` | Text | Reporter user ROWID |
| `story_points` | Text | Estimation in story points |
| `estimated_hours` | Text | Hour estimate |
| `logged_hours` | Text | Aggregated from time_entries |
| `due_date` | Text | `YYYY-MM-DD` |
| `completed_at` | Text | `YYYY-MM-DD HH:MM:SS` completion timestamp |
| `labels` | Text | JSON array e.g. `["frontend","urgent"]` |
| `custom_fields` | Text | JSON key-value for custom fields |
| `created_by` | Text | FK → users.ROWID |

**Index:** `project_id`, `sprint_id`, `assignee_id`, `status`, `due_date`

> **Important:** `assignee_ids` must be added as a Text column to enable multi-assignee support. Until added, only the primary `assignee_id` is stored.

---

### Table: `tenants`
| Column | Notes |
|---|---|
| `name` | Tenant/company name |
| `slug` | URL-safe unique identifier |
| `plan` | e.g. `STARTER`, `GROWTH`, `ENTERPRISE` |
| `status` | `ACTIVE` or `SUSPENDED` |
| `settings` | JSON string for tenant-level config |

---

### Table: `users`
| Column | Notes |
|---|---|
| `tenant_id` | FK → tenants.ROWID |
| `catalyst_user_id` | Zoho Catalyst user ID |
| `email` | |
| `name` | |
| `role` | `TENANT_ADMIN`, `DELIVERY_LEAD`, `TEAM_MEMBER`, `PMO`, `EXEC`, `CLIENT` |
| `status` | `ACTIVE`, `INACTIVE`, `INVITED` |
| `invite_token` | For pending invitations |
| `last_login` | ISO date string |

**Index:** `catalyst_user_id`, `email`, `tenant_id`

---

### Table: `projects`
| Column | Notes |
|---|---|
| `tenant_id` | |
| `name` | |
| `description` | |
| `client_name` | |
| `start_date` | `YYYY-MM-DD` |
| `end_date` | `YYYY-MM-DD` |
| `status` | `ACTIVE`, `ON_HOLD`, `COMPLETED`, `ARCHIVED` |
| `rag_status` | `GREEN`, `AMBER`, `RED` |
| `rag_reason` | Reason for current RAG status |
| `rag_updated_by` | User ROWID |
| `rag_updated_at` | ISO timestamp |
| `created_by` | User ROWID |

**Index:** `tenant_id`, `status`

---

### Table: `project_members`
| Column | Notes |
|---|---|
| `tenant_id` | |
| `project_id` | FK → projects.ROWID |
| `user_id` | FK → users.ROWID |
| `role` | `DELIVERY_LEAD`, `TEAM_MEMBER`, etc. |
| `joined_date` | `YYYY-MM-DD` |

**Index:** `project_id`, `user_id`

---

### Table: `milestones`
| Column | Notes |
|---|---|
| `tenant_id` | |
| `project_id` | |
| `title` | |
| `description` | |
| `due_date` | `YYYY-MM-DD` |
| `status` | `PENDING`, `IN_PROGRESS`, `COMPLETED`, `DELAYED` |
| `completion_date` | `YYYY-MM-DD` |
| `created_by` | User ROWID |

**Index:** `project_id`, `due_date`

---

### Table: `standup_entries`
| Column | Notes |
|---|---|
| `tenant_id` | |
| `project_id` | |
| `user_id` | |
| `entry_date` | `YYYY-MM-DD` |
| `yesterday` | What was done |
| `today` | What's planned |
| `blockers` | Any blockers (free text) |
| `mood` | `GREAT`, `GOOD`, `OKAY`, `STRUGGLING` |
| `submitted_at` | ISO timestamp |

**Index:** `project_id`, `user_id`, `entry_date`

---

### Table: `eod_entries`
| Column | Notes |
|---|---|
| `tenant_id` | |
| `project_id` | |
| `user_id` | |
| `entry_date` | `YYYY-MM-DD` |
| `accomplished` | What was accomplished |
| `progress_percentage` | `0`–`100` as text |
| `blockers` | Any blockers |
| `plan_for_tomorrow` | |
| `mood` | Same as standup |
| `submitted_at` | ISO timestamp |

**Index:** `project_id`, `user_id`, `entry_date`

---

### Table: `actions`
| Column | Notes |
|---|---|
| `tenant_id` | |
| `project_id` | |
| `title` | |
| `description` | |
| `status` | `OPEN`, `IN_PROGRESS`, `COMPLETED`, `CANCELLED` |
| `action_priority` | `HIGH`, `MEDIUM`, `LOW` |
| `assigned_to` | User ROWID |
| `due_date` | `YYYY-MM-DD` |
| `completed_date` | `YYYY-MM-DD` |
| `source` | `STANDUP`, `EOD`, `MEETING`, `MANUAL` |
| `created_by` | User ROWID |

**Index:** `project_id`, `assigned_to`, `status`, `due_date`

---

### Table: `blockers`
| Column | Notes |
|---|---|
| `tenant_id` | |
| `project_id` | |
| `title` | |
| `description` | |
| `status` | `OPEN`, `IN_PROGRESS`, `ESCALATED`, `RESOLVED` |
| `severity` | `CRITICAL`, `HIGH`, `MEDIUM`, `LOW` |
| `owner_user_id` | User ROWID |
| `raised_date` | `YYYY-MM-DD` |
| `resolved_date` | `YYYY-MM-DD` |
| `resolution` | How it was resolved |
| `escalated_at` | ISO timestamp |
| `created_by` | User ROWID |

**Index:** `project_id`, `status`, `raised_date`

---

### Table: `risks`
| Column | Notes |
|---|---|
| `tenant_id` | |
| `project_id` | |
| `title` | |
| `description` | |
| `probability` | `HIGH`, `MEDIUM`, `LOW` |
| `impact` | `HIGH`, `MEDIUM`, `LOW` |
| `status` | `OPEN`, `MITIGATED`, `CLOSED` |
| `mitigation` | Mitigation plan |
| `owner_user_id` | |
| `created_by` | |

---

### Table: `issues`
| Column | Notes |
|---|---|
| `tenant_id` | |
| `project_id` | |
| `title` | |
| `description` | |
| `severity` | `CRITICAL`, `HIGH`, `MEDIUM`, `LOW` |
| `status` | `OPEN`, `IN_PROGRESS`, `RESOLVED`, `CLOSED` |
| `owner_user_id` | |
| `created_by` | |

---

### Table: `dependencies`
| Column | Notes |
|---|---|
| `tenant_id` | |
| `project_id` | |
| `title` | |
| `description` | |
| `dependency_type` | `INTERNAL`, `EXTERNAL` |
| `dependent_on` | Team / system name |
| `due_date` | `YYYY-MM-DD` |
| `status` | `PENDING`, `MET`, `AT_RISK`, `BLOCKED` |
| `owner_user_id` | |
| `created_by` | |

---

### Table: `assumptions`
| Column | Notes |
|---|---|
| `tenant_id` | |
| `project_id` | |
| `title` | |
| `description` | |
| `impact_if_wrong` | |
| `status` | `VALID`, `INVALID`, `UNDER_REVIEW` |
| `owner_user_id` | |
| `created_by` | |

---

### Table: `decisions`
| Column | Notes |
|---|---|
| `tenant_id` | |
| `project_id` | |
| `title` | |
| `description` | |
| `rationale` | Why this was decided |
| `impact` | Expected impact |
| `decision_date` | `YYYY-MM-DD` |
| `status` | `APPROVED`, `REJECTED`, `PENDING_REVIEW` |
| `made_by` | User ROWID |
| `created_by` | |

**Index:** `project_id`, `decision_date`

---

### Table: `reports`
| Column | Notes |
|---|---|
| `tenant_id` | |
| `project_id` | |
| `report_type` | `WEEKLY`, `MONTHLY`, `CUSTOM` |
| `period_start` | `YYYY-MM-DD` |
| `period_end` | `YYYY-MM-DD` |
| `summary` | JSON string of computed report data |
| `generated_by` | User ROWID |
| `generated_at` | ISO timestamp |

**Index:** `project_id`, `period_start`

---

### Table: `audit_logs`
| Column | Notes |
|---|---|
| `tenant_id` | |
| `entity_type` | Table name |
| `entity_id` | ROWID of the entity |
| `action` | `CREATE`, `UPDATE`, `DELETE` |
| `old_value` | JSON string |
| `new_value` | JSON string |
| `performed_by` | User ROWID |
| `performed_at` | ISO timestamp |

**Index:** `tenant_id`, `entity_type`, `entity_id`

---

### Table: `notification_events`
| Column | Notes |
|---|---|
| `tenant_id` | |
| `user_id` | Recipient |
| `type` | `STANDUP_REMINDER`, `EOD_REMINDER`, `ACTION_OVERDUE`, `BLOCKER_ESCALATION` |
| `entity_id` | Related entity ROWID |
| `sent_at` | ISO timestamp |
| `status` | `SENT`, `FAILED` |

**Index:** `user_id`, `type`, `sent_at`

---

## 2. Catalyst Auth — Setup

1. In **Catalyst Console → Authentication**, enable **Zoho Auth** (or other providers as needed).
2. Set **Authorized Redirect URIs** to include your Catalyst app domain.
3. The app uses `/__catalyst/auth/login` and `/__catalyst/auth/logout` — these are managed automatically by Catalyst.

---

## 3. Serverless Function — Deploy

```bash
# From the project root
catalyst deploy --only functions
```

The function `delivery_sync_function` is an **Advanced I/O** function. Ensure `catalyst.json` has:

```json
{
  "function": {
    "name": "delivery_sync_function",
    "type": "advancedio"
  }
}
```

### Environment variables (set in Catalyst Console → Functions → delivery_sync_function → Configuration)

| Variable | Value |
|---|---|
| `NODE_ENV` | `production` |

---

## 4. Cron Jobs — Setup

In **Catalyst Console → Cron**, create the following jobs:

| Job Name | Schedule | Target URL |
|---|---|---|
| `standup-reminder` | `0 9 * * 1-5` (Mon–Fri 9am UTC) | `https://<app>.catalystserverless.com/server/delivery_sync_function/api/cron/standup-reminder` |
| `eod-reminder` | `0 17 * * 1-5` (Mon–Fri 5pm UTC) | `https://<app>.catalystserverless.com/server/delivery_sync_function/api/cron/eod-reminder` |
| `action-overdue-check` | `0 8 * * 1-5` (Mon–Fri 8am UTC) | `https://<app>.catalystserverless.com/server/delivery_sync_function/api/cron/action-overdue` |
| `blocker-escalation` | `0 10 * * 1-5` (Mon–Fri 10am UTC) | `https://<app>.catalystserverless.com/server/delivery_sync_function/api/cron/blocker-escalation` |

Catalyst sends an `x-zoho-catalyst-is-cron: true` header automatically — the function uses this to authenticate cron requests.

---

## 5. Frontend — Build and Deploy

```bash
cd frontend
npm install
npm run build
```

Copy the `build/` folder contents to **Catalyst Console → Web Client → [your web client] → Upload**.

Or use the CLI:
```bash
catalyst deploy --only client
```

Make sure `catalyst.json` has your web client configured to serve from `frontend/build/`.

---

## 6. First-Time Tenant Setup

1. Navigate to your deployed app URL.
2. You will be redirected to Catalyst Auth login.
3. After authenticating, call the registration endpoint once to create your tenant:

```bash
POST /server/delivery_sync_function/api/auth/register-tenant
Content-Type: application/json

{
  "tenant_name": "Your Company",
  "tenant_slug": "your-company"
}
```

This creates:
- A `tenants` row for your organisation
- A `users` row with role `TENANT_ADMIN` linked to your Catalyst account

4. Subsequent users must be **invited** via **Admin → Invite User**. They will authenticate via Zoho and be linked to your tenant on first login.

---

## 7. Inviting Users

1. Go to **Admin → Users → Invite User**.
2. Fill in name, email, and role.
3. The system creates a `users` record with `status = INVITED`.
4. The invited user logs in via Catalyst Auth — on first login, `AuthController.acceptInvite` matches their Catalyst email to the invited record and activates their account.

> **Note:** The user must already have a Zoho account. The invitation flow relies on email matching between the `users` table and their Catalyst identity.

---

## 8. Role Reference

| Role | Description |
|---|---|
| `TENANT_ADMIN` | Full access: user management, all projects, admin settings |
| `DELIVERY_LEAD` | Manage projects they lead, all RAID/blockers/decisions for those projects |
| `TEAM_MEMBER` | Submit standups/EODs, manage own actions, view project data |
| `PMO` | Read access across all projects, generate reports, view portfolio |
| `EXEC` | Dashboard and portfolio view, read-only |
| `CLIENT` | Read-only access to their assigned project dashboard |

---

## 9. Local Development

```bash
# Terminal 1 — Backend (via Catalyst local)
catalyst serve

# Terminal 2 — Frontend dev server
cd frontend
npm start
```

The frontend dev server proxies API calls to `localhost:9000` (Catalyst local serve port). Add to `frontend/package.json`:

```json
"proxy": "http://localhost:9000"
```

Then API calls to `/server/delivery_sync_function/api/...` will be proxied correctly during local development.

---

## 10. Architecture Summary

```
Browser
  └─ React SPA (CRA + TypeScript + Tailwind)
       └─ Axios → /server/delivery_sync_function/api/*
            └─ Catalyst Advanced I/O Function (Express.js)
                 ├─ AuthMiddleware (Catalyst session → users table)
                 ├─ RBACMiddleware (role-permission matrix)
                 ├─ Controllers (class-per-request, catalystApp injected)
                 └─ DataStoreService (ZCQL queries, multi-tenant)
                      └─ Catalyst DataStore (17 tables)
```

Every query enforces `tenant_id` isolation — no cross-tenant data leakage is possible at the service layer.
