# DSV-One — AI-Powered Project, People & Asset Management

> Build to give every team the clarity to deliver.

DSV-One (also marketed as **DSV OpsPulse**) is an enterprise-grade SaaS platform that unifies project delivery, people operations, and asset management into a single workspace. It replaces scattered spreadsheets, chat threads, and status calls with structured daily updates, an AI insights engine, and role-scoped dashboards — giving every stakeholder from team member to CEO the exact visibility they need.

**Live:** [https://www.dsv-one.com](https://www.dsv-one.com) · **App:** [https://dev-ekatva.dsv360.ai](https://dev-ekatva.dsv360.ai)

---

## Table of Contents

- [Why DSV-One](#why-dsv-one)
- [Key Features](#key-features)
- [Tech Stack](#tech-stack)
- [Architecture](#architecture)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [Backend Functions](#backend-functions)
- [Role & Permission Model](#role--permission-model)
- [AI Capabilities](#ai-capabilities)
- [Deployment](#deployment)
- [Contributing](#contributing)

---

## Why DSV-One

| Problem | DSV-One Solution |
|---|---|
| Status updates scattered across Slack/email | Structured daily standups & EODs in one place |
| Blockers stay invisible until it's too late | Real-time blocker tracking with auto-escalation after 3 days |
| Executives can't get a clear picture without meetings | CEO/CTO dashboards with AI executive brief |
| Clients require manual report preparation | Auto-generated reports shared via public links — no login needed |
| Risk detection happens after the fact | AI health scoring surfaces projects "At Risk" days earlier |
| Asset tracking lives in spreadsheets | Full asset lifecycle: request → approve → assign → maintain |

---

## Key Features

### Projects & Portfolio
- Create and manage multiple projects with RAG status (Red / Amber / Green)
- Project-level dashboard: milestones, actions, blockers, RAID, decisions, team activity
- Portfolio view for PMO and executive oversight across all active projects

### Daily Ops
- **Standups** — What I did / What I'm doing / Blockers, with voice submission support
- **EOD Reports** — Accomplished / Planned / Mood level with team rollup views
- Automated daily reminders with compliance tracking

### Delivery Tracking
- **Milestones** — Track delivery checkpoints with overdue alerts
- **Actions** — Owner + due date + priority with overdue escalation
- **Blockers** — Four severity levels, auto-escalate after 3 days, visible in exec dashboards
- **RAID Register** — Risks, Assumptions, Issues, Dependencies per project
- **Decisions Log** — Architectural and business decisions with full audit trail

### Tasks & Sprints
- Full task management: type, priority, story points, assignee, attachments
- Kanban board with drag-and-drop, backlog management, sprint planning
- Sprint creation, activation, completion with retrospective generation

### People Operations
- **Attendance** — Clock-in/out with geolocation and anomaly detection
- **Leave Management** — Request, approve/reject, balance tracking, policy enforcement
- **Directory & Org Chart** — Employee search, visual hierarchy
- **Announcements** — Publish with read-receipt tracking
- **Badges & Profiles** — Skills, bio, social links, uploaded resume viewer

### Asset Management
- Asset categories, inventory, and lifecycle tracking
- Request workflow: submit → approve/reject → assign
- Maintenance scheduling

### Time Tracking
- Log time against tasks and projects
- Submit-for-approval workflow with email notifications
- Export for time reports and billing

### AI Insights Engine
- **Project Health** — On Track / At Risk / Delayed with written reasoning
- **Daily Summary** — Aggregated team accomplishments and sentiment
- **Blocker Detection** — Surfaces implicit blockers from unstructured standup text
- **Trend Analysis** — 7–90 day productivity, engagement, and mood trends
- **Sprint Retrospective** — Auto-generated retros with action suggestions
- **Natural Language Query** — Ask "Which projects are at risk?" and get a direct answer
- Role-scoped: Admins/PMO see tenant-wide; Leads see their projects; Members see their own work

### Reports & Sharing
- Weekly, monthly, and custom date range reports
- Report types: User Performance, Team Performance, Daily Summary, Project Summary
- PDF export via SmartBrowz
- **Public share links** — send a live report to a client with no login required

### Administration & Compliance
- Invite users, manage roles, deactivate accounts
- Workflow configs, form configs, feature flags, permission overrides
- IP allowlisting, notification preferences
- Super Admin panel for platform-level management
- **Full audit log** — every create/update/delete/status-change recorded immutably

---

## Tech Stack

### Frontend
| Layer | Technology |
|---|---|
| Framework | React 19 + TypeScript 5.3 |
| Routing | React Router DOM 6 |
| UI | Headless UI 2, Tailwind CSS 3, Lucide React |
| State / Data Fetching | TanStack Query 5 |
| Forms | React Hook Form 7 |
| Charts | Recharts 2 |
| Drag-and-Drop | dnd-kit (core + sortable) |
| HTTP | Axios 1.6 |
| Date Handling | date-fns 3 |
| Internationalization | i18next |
| Build | React Scripts 5 |

### Backend
| Layer | Technology |
|---|---|
| Runtime | Node.js 20 / 24 |
| HTTP Framework | Express 4.18 |
| Platform SDK | zcatalyst-sdk-node (latest) |
| Database | Zoho Catalyst DataStore (ZCQL) |
| Validation | Joi 17 |
| Environment | dotenv |
| Tests | Jest 29 + Supertest |

### Platform Services (Zoho Catalyst)
| Service | Usage |
|---|---|
| DataStore | Primary multi-tenant database (ZCQL, 60+ tables) |
| Stratus | Object storage — avatars, attachments, bug screenshots, docs |
| Auth (Embedded SSO) | Session-based authentication |
| QuickML | LLM inference (Qwen 30B Text MoE) for AI insights |
| ConvoKraft | Conversational AI bot widget |
| SmartBrowz | Headless browser for PDF report generation |
| Zia | OCR and text analytics |
| Signals | Async event bus for cross-function communication |
| Cron | Dynamic scheduled jobs |
| Cache | Redis-compatible layer for hot data |
| Mail SDK | Transactional email |

### Mobile (Flutter)
| Layer | Technology |
|---|---|
| Framework | Flutter 3.19 / Dart 3.3 |
| State | Riverpod 2.5 |
| Navigation | Go Router 13 |
| HTTP | Dio 5.4 |
| Secure Storage | flutter_secure_storage 9 |
| Platform SDK | zcatalyst_sdk 2.2 |

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│               React Frontend (TypeScript)               │
│   50+ Pages · Role-based Gating · Real-time Notifs     │
└────────────────────────┬────────────────────────────────┘
                         │ HTTPS (Catalyst Proxy /__catalyst/api/*)
┌────────────────────────▼────────────────────────────────┐
│           Zoho Catalyst API Gateway                     │
│       (Auto-scaling · Global · HTTPS)                   │
└────────────────────────┬────────────────────────────────┘
              ┌──────────┴───────────┐
              ▼                      ▼
┌─────────────────────┐  ┌──────────────────────────────┐
│  Advanced IO (REST) │  │  Scheduled Jobs & Events     │
│                     │  │                              │
│  delivery_sync_fn   │  │  team_reminder   (daily)     │
│  ai_service         │  │  people_wish     (birthday)  │
│  task_sprint_svc    │  │  leave_policy    (monthly)   │
│  time_tracking_svc  │  │  automated_checkout (EOD)    │
│  people_service     │  │  user_confirmation (event)   │
│  asset_service      │  └──────────────────────────────┘
│  badge_profile_svc  │
│  admin_config_svc   │
│  reporting_service  │
│  bot_service        │
│  doc_service        │
│  bug_service        │
└──────────┬──────────┘
           ▼
┌──────────────────────────────────────────────────────┐
│         Catalyst DataStore  (tenant-isolated)        │
│      Every table: WHERE tenant_id = ?                │
└──────────────────────┬───────────────────────────────┘
              ┌────────┴────────┐
              ▼                 ▼
┌─────────────────────┐  ┌─────────────────────────────┐
│  Shared Services    │  │  AI & Analytics             │
│  · Cache (Redis)    │  │  · QuickML (LLM inference)  │
│  · Stratus (files)  │  │  · ConvoKraft (chatbot)     │
│  · Signals (events) │  │  · SmartBrowz (PDF)         │
│  · Mail SDK         │  │  · Zia (OCR / sentiment)    │
│  · Cron (scheduler) │  │  · Catalyst SQL (analytics) │
└─────────────────────┘  └─────────────────────────────┘
```

### Multi-Tenancy
Every database table carries a `tenant_id` column. Every query is scoped by it — no cross-tenant data leakage is architecturally possible. Tenant slug drives the frontend routing (`/:tenantSlug/dashboard`).

### Auth & Authorization
- **Authentication**: Embedded Catalyst SSO (session cookies, no JWTs). First user in an org auto-becomes `TENANT_ADMIN`.
- **Authorization**: 25+ granular permissions checked per route via a `PermRoute` component on the frontend and middleware on every backend function.

### Key Patterns
- **Cache-through** for hot data: dashboards, permission matrices, leave balances
- **Audit-everything**: immutable event log on every entity mutation
- **Public tokens**: report and document sharing without requiring a login
- **Event-driven**: Catalyst Signals for async cross-function communication

---

## Project Structure

```
/
├── frontend/                  # React TypeScript SPA
│   ├── public/
│   ├── src/
│   │   ├── components/        # Shared UI components
│   │   │   ├── bot/           # Conversational AI widget
│   │   │   ├── bugs/          # Bug report widget
│   │   │   ├── layout/        # Sidebar, navbar, layout shell
│   │   │   └── ui/            # Buttons, modals, tables, etc.
│   │   ├── hooks/             # Custom React hooks (data + auth)
│   │   ├── i18n/              # Internationalization (en + more)
│   │   ├── lib/               # Axios API client
│   │   ├── pages/             # 50+ page components
│   │   ├── types/             # Shared TypeScript types
│   │   └── utils/             # Helpers, permissions, formatters
│   └── package.json
│
├── functions/                 # Zoho Catalyst serverless functions
│   ├── delivery_sync_function/    # Core APIs
│   ├── ai_service/                # LLM + AI insights
│   ├── task_sprint_service/       # Tasks, sprints, kanban
│   ├── time_tracking_service/     # Time logging + approval
│   ├── people_service/            # Attendance, leave, org
│   ├── asset_service/             # Asset lifecycle
│   ├── badge_profile_service/     # Profiles, badges, resumes
│   ├── admin_config_service/      # Config, workflows, flags
│   ├── reporting_service/         # Reports, PDF, public links
│   ├── bot_service/               # Chatbot API
│   ├── doc_service/               # Document management
│   ├── bug_service/               # Bug tracking
│   ├── team_reminder/             # Cron: daily reminders
│   ├── leave_policy/              # Cron: leave accrual
│   ├── people_wish/               # Cron: birthday/anniversary
│   ├── automated_checkout/        # Cron: attendance checkout (Python)
│   └── user_confirmation/         # Event: user signup flow
│
├── mobile/                    # Flutter native app (Android + iOS)
│
├── .catalystrc                # Catalyst project configuration
├── catalyst.json              # Catalyst metadata
└── README.md
```

---

## Getting Started

### Prerequisites
- Node.js 20+
- npm 9+
- [Zoho Catalyst CLI](https://www.zoho.com/catalyst/help/zcatalyst-cli.html)
- A Zoho Catalyst project (free tier available)

### 1. Clone the repository

```bash
git clone https://github.com/your-org/dsv-one.git
cd dsv-one
```

### 2. Install frontend dependencies

```bash
cd frontend
npm install
```

### 3. Install function dependencies

```bash
# Install for each function you need locally
cd functions/delivery_sync_function && npm install
cd ../ai_service && npm install
# ... repeat for others as needed
```

### 4. Configure environment variables

Copy the example files and fill in your values:

```bash
# Each function has its own .env
cp functions/delivery_sync_function/.env.example functions/delivery_sync_function/.env
# Edit with your Catalyst project credentials
```

See [Environment Variables](#environment-variables) for the full reference.

### 5. Run locally via Catalyst CLI

```bash
# From the project root
zcatalyst serve
```

The Catalyst local server proxies the frontend at `http://localhost:3000` and mounts all functions under `/__catalyst/api/*`.

---

## Environment Variables

Each function has its own `.env` file. Below are the common variables used across functions.

> **Note:** `.env` files are git-ignored. Never commit secrets. For deployment, populate `env_variables` in each function's `catalyst-config.json` before running `zcatalyst deploy`.

| Variable | Description | Example |
|---|---|---|
| `NODE_ENV` | Runtime environment | `development` |
| `ENVIRONMENT` | App environment flag | `development` |
| `APP_URL` | Base URL of the deployed app | `https://dev-ekatva.dsv360.ai` |
| `FROM_EMAIL` | Sender address for transactional email | `catalystadmin@dsv360.ai` |
| `INTERNAL_SECRET` | Shared secret for internal service calls | — |
| `CLIENT_ID` | Zoho OAuth Client ID (ai_service, bot_service) | — |
| `CLIENT_SECRET` | Zoho OAuth Client Secret | — |
| `REFRESH_TOKEN_DEV` | OAuth refresh token (dev) | — |
| `REFRESH_TOKEN_PROD` | OAuth refresh token (prod) | — |
| `ORG_ID` | Zoho Org ID | — |
| `STRATUS_BUCKET_NAME` | Catalyst Stratus bucket name | `profiles-users` |
| `STRATUS_USER_AVATARS_URL` | Public URL for user avatar bucket | — |
| `STRATUS_ATTACHMENTS_BUCKET` | Task attachment bucket name | `attachments-tasks` |
| `STRATUS_DOCS_BUCKET` | Project docs bucket name | `project-docs` |
| `ROLE_ID_*` | Catalyst role IDs for permission checks | — |
| `WISHES_POOL_ID` | Catalyst cache pool for birthday wishes | — |

---

## Backend Functions

| Function | Type | Node | Responsibility |
|---|---|---|---|
| `delivery_sync_function` | Advanced IO | 20 | Projects, milestones, standups, EODs, actions, blockers, RAID, decisions, teams, notifications, admin, reporting, dashboards |
| `ai_service` | Advanced IO | 20 | LLM inference, project health scoring, daily summaries, trend analysis, sprint retros, NL queries, voice processing |
| `task_sprint_service` | Advanced IO | 20 | Tasks, subtasks, sprints, kanban board, backlog, sprint planning |
| `time_tracking_service` | Advanced IO | 20 | Time entries, approval workflow, exports |
| `people_service` | Advanced IO | 20 | Attendance, leave requests/approvals, org hierarchy, announcements |
| `asset_service` | Advanced IO | 20 | Asset inventory, request/approve/assign, maintenance, lifecycle |
| `badge_profile_service` | Advanced IO | 20 | User profiles, skills, badges, resume uploads/viewer |
| `admin_config_service` | Advanced IO | 20 | Workflow config, form config, feature flags, permission overrides |
| `reporting_service` | Advanced IO | 20 | Aggregated reports, PDF generation, public share tokens |
| `bot_service` | Advanced IO | 20 | Conversational AI bot API, ConvoKraft integration |
| `doc_service` | Advanced IO | 24 | Project documents, file attachments, versioning |
| `bug_service` | Advanced IO | 20 | Bug tracking, screenshot attachments, issue triage |
| `team_reminder` | Job (Cron) | 24 | Daily standup and EOD reminders per team |
| `leave_policy` | Job (Cron) | 24 | Leave accrual calculation, policy enforcement |
| `people_wish` | Job (Cron) | 24 | Birthday and work anniversary notifications |
| `automated_checkout` | Job (Cron) | Python 3.9 | Auto-checkout attendance at end of working day |
| `user_confirmation` | Event | 20 | Triggered on Catalyst user signup events |

---

## Role & Permission Model

Six tenant roles with 25+ granular permissions enforced at both the API middleware and UI route layers.

| Role | Scope |
|---|---|
| `TENANT_ADMIN` | Full access — users, config, all data |
| `PMO` | Portfolio view, all projects, reports, admin-lite |
| `DELIVERY_LEAD` | Full access to assigned projects |
| `TEAM_MEMBER` | Personal work, assigned project participation |
| `EXEC` | Read-only dashboards and reports (executive view) |
| `CLIENT` | Read-only public-facing project reports |

> Role strings are never hard-coded in business logic. All checks go through the permission matrix.

---

## AI Capabilities

The `ai_service` function uses **Zoho Catalyst QuickML** (Qwen 30B Text MoE) as the inference backend. Inputs are structured from the DataStore — standup entries, task statuses, blocker counts, milestone completion rates — and passed as context to the model.

| Capability | What It Does |
|---|---|
| Project Health Score | Classifies each project as On Track / At Risk / Delayed with written reasoning |
| Daily Summary | Aggregates what the whole team accomplished and surfaces mood/sentiment |
| Blocker Detection | Reads standup text to find implicit blockers not formally raised |
| Trend Analysis | Plots productivity, engagement, and mood over 7–90 day windows |
| Performance Insights | Per-member analysis for managers and self-review |
| Sprint Retrospective | Auto-generates what went well, what didn't, and action items |
| NL Query | Free-text question → structured answer from delivery data |
| Voice Submission | Transcribes voice standup/EOD, structures it, and saves it |

All AI responses are **role-scoped**: a TEAM_MEMBER only sees their own insights; a PMO or TENANT_ADMIN sees the full tenant picture.

---

## Deployment

DSV-One is deployed to **Zoho Catalyst Serverless**.

### Pre-deploy checklist

1. Populate `env_variables` in each function's `catalyst-config.json` from the corresponding `.env` file.
2. Verify the Catalyst project ID in `.catalystrc`.
3. Run `npm run build` in `frontend/` to produce the production bundle.

### Deploy

```bash
# Deploy all functions + frontend in one command
zcatalyst deploy
```

### Post-deploy

After pushing to GitHub, clear all `env_variables` back to `{}` in every `catalyst-config.json` to avoid committing secrets.

### Environments

| Environment | URL |
|---|---|
| Development | https://dev-ekatva.dsv360.ai |
| Production | https://www.dsv-one.com |

---

## Contributing

1. Fork the repository and create a feature branch off `main`.
2. Follow the existing code conventions (TypeScript strict, ESLint, no `any`).
3. Add or update tests for any logic you change.
4. Open a pull request with a clear description of the change and screenshots for UI changes.
5. One approval from a maintainer is required to merge.

For bugs or feature requests, open an issue with steps to reproduce or a clear user story.

---

## License

Proprietary — © DSV Corp. All rights reserved.
