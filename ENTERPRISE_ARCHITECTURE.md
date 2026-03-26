# Delivery Sync — Enterprise Architecture Design
## Principal Software Architect Document · v2.0

> **Rules:** Extends existing system only. Zero rewrites. All existing tables, routes, RBAC, notifications, audit logs, and AI pipelines are preserved and integrated.

---

## TABLE OF CONTENTS

1. [Architecture Overview](#1-architecture-overview)
2. [Zoho Catalyst Services Map](#2-zoho-catalyst-services-map)
3. [Complete Microservices Design](#3-complete-microservices-design)
4. [Database Schema — All Tables with Field Types](#4-database-schema)
5. [API Design — All Services](#5-api-design)
6. [Event-Driven Flows — Signals/Event Bus](#6-event-driven-flows)
7. [AI System Design — Prompts & Pipelines](#7-ai-system-design)
8. [Cron Job Design](#8-cron-job-design)
9. [RBAC Model — Extended (50+ Permissions)](#9-rbac-model)
10. [Storage Design — Stratus](#10-storage-design)
11. [Admin Config System — No-Code Builder](#11-admin-config-system)
12. [Data Migration Strategy](#12-data-migration-strategy)
13. [Frontend Extension Plan](#13-frontend-extension-plan)
14. [Notification System Extension](#14-notification-system-extension)
15. [Integration Map](#15-integration-map)

---

## 1. ARCHITECTURE OVERVIEW

### 1.1 System Topology

```
┌─────────────────────────────────────────────────────────────────────┐
│                     DELIVERY SYNC — ENTERPRISE                       │
│                    Zoho Catalyst Cloud Platform                      │
└─────────────────────────────────────────────────────────────────────┘

FRONTEND (Catalyst Slate — React 19 + TypeScript)
    │
    ├── /server/delivery_sync_function     ← EXISTING (do not rewrite)
    ├── /server/ai_service                 ← EXISTING (do not rewrite)
    ├── /server/task_sprint_service        ← NEW
    ├── /server/time_tracking_service      ← NEW
    ├── /server/people_service             ← NEW
    ├── /server/asset_service              ← NEW
    ├── /server/badge_profile_service      ← NEW
    ├── /server/admin_config_service       ← NEW
    └── /server/reporting_service          ← NEW

SHARED INFRASTRUCTURE
    ├── Catalyst DataStore (ZCQL)          ← Transactional data
    ├── Catalyst SQL                       ← Analytics / Reporting
    ├── Catalyst Cache                     ← Hot data / AI tokens / Sessions
    ├── Catalyst Signals                   ← Async event bus
    ├── Catalyst Cron                      ← Scheduled jobs (12 total)
    ├── Catalyst Stratus                   ← File storage
    ├── Catalyst QuickML                   ← LLM + ML models
    ├── Catalyst ConvoKraft                ← NLP chatbot interface
    ├── Catalyst SmartBrowz                ← PDF report generation
    ├── Catalyst Auth                      ← Identity
    └── Catalyst Zia                       ← OCR / Text analytics
```

### 1.2 Communication Patterns

| Pattern | Used For | Technology |
|---|---|---|
| Sync REST | Client-facing CRUD | Serverless Functions → DataStore |
| Async Event | Notifications, AI triggers, approvals | Catalyst Signals |
| Scheduled | Reminders, escalations, summaries | Catalyst Cron |
| Cache-through | Dashboard data, AI tokens, hot queries | Catalyst Cache |
| File I/O | Uploads, exports, resume storage | Catalyst Stratus |
| AI inference | Analysis, chat, NLP | QuickML + ConvoKraft |
| PDF export | Report sharing | SmartBrowz |

### 1.3 Tenant Isolation Contract

Every table has `tenant_id BIGINT NOT NULL`. Every query includes `WHERE tenant_id = ?`. No cross-tenant leakage is possible by architecture.

---

## 2. ZOHO CATALYST SERVICES MAP

### 2.1 DataStore (ZCQL) — Transactional Layer
- **All 19 existing tables** (unchanged)
- **41 new tables** (defined in Section 4)
- Read via ZCQL SELECT queries
- Write via Catalyst DataStore Table Row APIs
- Used by: all 9 serverless functions

### 2.2 Catalyst SQL — Analytics Layer
- Heavy aggregations (time reports, sprint velocity, attendance summaries)
- Cannot do joins via ZCQL — offload to Catalyst SQL
- Tables: `time_entries_agg`, `sprint_velocity_history`, `project_health_snapshots`, `attendance_monthly_summary`, `user_performance_scores`
- Populated by: cron jobs that sync from DataStore nightly

### 2.3 Catalyst Cache
| Cache Key Pattern | TTL | Stores |
|---|---|---|
| `ai_token:{tenant}` | 55 min | LLM OAuth token (existing) |
| `dashboard:{tenant}:{role}` | 5 min | CEO/CTO dashboard payload |
| `portfolio:{tenant}` | 5 min | Portfolio summary |
| `user_profile:{userId}` | 15 min | User profile + badges |
| `sprint_board:{sprintId}` | 2 min | Kanban board state |
| `leave_balance:{userId}:{year}` | 30 min | Leave balances |
| `permissions:{userId}` | 10 min | Resolved permissions set |
| `asset_inventory:{tenant}` | 10 min | Available asset counts |

### 2.4 Catalyst Signals — Event Bus
**14 event types** defined in Section 6.

### 2.5 Catalyst Cron — Scheduled Jobs
**12 cron jobs** defined in Section 8.

### 2.6 Catalyst Stratus — File Storage
| Folder | Contents | Allowed Types |
|---|---|---|
| `/attachments/tasks/{taskId}/` | Task file attachments | PDF, PNG, JPG, DOCX, XLSX, ZIP |
| `/attachments/assets/{assetId}/` | Asset documents, photos | PDF, PNG, JPG |
| `/profiles/{userId}/photo` | Profile pictures | PNG, JPG, WEBP |
| `/profiles/{userId}/resume` | Resumes | PDF, DOCX |
| `/badges/{badgeId}/logo` | Badge logos | PNG, SVG |
| `/reports/{reportId}/export` | PDF exports | PDF |
| `/announcements/{id}/media` | Announcement images | PNG, JPG |

### 2.7 Catalyst QuickML — AI/ML
- Existing: Qwen 30B MoE for delivery intelligence
- New models to add:
  - **Burnout Predictor** — classifies user burnout risk (LOW/MEDIUM/HIGH) from mood + work hours
  - **Sprint Completion Predictor** — regression model on velocity/scope
  - **Asset Demand Predictor** — forecasts asset requests by category/month

### 2.8 Catalyst ConvoKraft — NLP Interface
- Extended from existing NL Query endpoint
- Full conversational bot: "Show me leave balance for John", "Who is on leave this week?", "What is the status of Sprint 3?"
- Integrated as a floating chat widget in the frontend

### 2.9 Catalyst SmartBrowz — Document Generation
- PDF generation for:
  - Project reports (existing, now routed through SmartBrowz)
  - Sprint retrospectives
  - Time-tracking invoices (billable hours)
  - User performance reports
  - Asset assignment letters

### 2.10 Catalyst Zia Services
- **OCR**: Parse uploaded receipts/invoices for asset purchase records
- **Text Analytics**: Sentiment scoring on standup/EOD entries (feeds AI burnout model)

---

## 3. COMPLETE MICROSERVICES DESIGN

### 3.1 Service Registry

| Service | Function Name | Responsibility | Port / Path |
|---|---|---|---|
| Core API | `delivery_sync_function` | Projects, Milestones, Standups, EOD, Actions, Blockers, RAID, Decisions, Teams, Reports, Dashboards, Notifications, Admin, Audit | `/server/delivery_sync_function` |
| AI Engine | `ai_service` | LLM inference, health scoring, retrospectives, NL queries, voice | `/server/ai_service` |
| Task & Sprint | `task_sprint_service` | Tasks, Subtasks, Stories, Bugs, Sprints, Kanban, Backlog | `/server/task_sprint_service` |
| Time Tracking | `time_tracking_service` | Time entries, billable hours, approval flow, exports | `/server/time_tracking_service` |
| People | `people_service` | Attendance, Leave, Announcements, Org Hierarchy | `/server/people_service` |
| Asset | `asset_service` | Asset inventory, requests, assignments, lifecycle | `/server/asset_service` |
| Badge & Profile | `badge_profile_service` | Badges, User profiles, Skills, Resumes | `/server/badge_profile_service` |
| Admin Config | `admin_config_service` | Workflows, Form configs, Permissions, Feature flags | `/server/admin_config_service` |
| Reporting | `reporting_service` | Cross-service aggregated reports, PDF exports, public links | `/server/reporting_service` |

### 3.2 Shared Libraries (copy into each new function)
Each new function MUST include copies of:
- `AuthMiddleware.js` — same Catalyst session resolution pattern
- `RBACMiddleware.js` — extended permission set
- `DataStoreService.js` — base ZCQL + write layer
- `AuditService.js` — same audit log pattern
- `NotificationService.js` — same notification dispatch
- `ResponseHelper.js` — same HTTP response format
- `Constants.js` — extended with new roles/permissions

### 3.3 Inter-Service Communication
Services **do not call each other directly** (to avoid tight coupling). They:
1. **Read** shared DataStore tables directly (each service has read access to all tables with tenant isolation)
2. **Write** to Signals for async cross-service effects
3. **Cache** hot data in Catalyst Cache to avoid repeated ZCQL queries

---

## 4. DATABASE SCHEMA

> **Notation:** `PK` = auto-generated ROWID in Catalyst DataStore. `BIGINT` = Catalyst BigInt. `TEXT` = Catalyst Text (65535 chars). `VARCHAR(n)` = Catalyst VARCHAR. `BOOLEAN` = Catalyst Boolean. `DOUBLE` = Catalyst Double. `DATETIME` = Catalyst DateTime.

> **DataStore ROWID:** Catalyst auto-creates a `ROWID` (BigInt) primary key for every table. Use `ROWID` as `id` throughout.

---

### EXISTING TABLES (19) — DO NOT MODIFY
```
tenants, users, projects, project_members, milestones,
standup_entries, eod_entries, actions, blockers, risks,
issues, dependencies, assumptions, decisions, reports,
audit_logs, notification_events, teams, notifications
```

---

### 4.1 TASK & SPRINT SERVICE TABLES

#### Table: `sprints`
| Column | Type | Constraints | Description |
|---|---|---|---|
| ROWID | BIGINT | PK auto | Sprint ID |
| tenant_id | BIGINT | NOT NULL INDEX | Tenant isolation |
| project_id | BIGINT | NOT NULL INDEX | Parent project |
| name | VARCHAR(255) | NOT NULL | Sprint name (e.g., "Sprint 1") |
| goal | TEXT | NULL | Sprint goal statement |
| start_date | DATETIME | NOT NULL | Sprint start |
| end_date | DATETIME | NOT NULL | Sprint end |
| status | VARCHAR(50) | NOT NULL DEFAULT 'PLANNING' | PLANNING\|ACTIVE\|COMPLETED\|CANCELLED |
| velocity | DOUBLE | NULL | Story points completed |
| capacity_points | DOUBLE | NULL | Total capacity in story points |
| completed_points | DOUBLE | NULL | Points completed at close |
| retrospective_id | BIGINT | NULL | FK → sprint_retrospectives |
| created_by | BIGINT | NOT NULL | FK → users.ROWID |
| created_at | DATETIME | NOT NULL | Creation timestamp |
| updated_at | DATETIME | NOT NULL | Last update timestamp |

#### Table: `tasks`
| Column | Type | Constraints | Description |
|---|---|---|---|
| ROWID | BIGINT | PK auto | Task ID |
| tenant_id | BIGINT | NOT NULL INDEX | Tenant isolation |
| project_id | BIGINT | NOT NULL INDEX | Parent project |
| sprint_id | BIGINT | NULL INDEX | Assigned sprint (null = backlog) |
| parent_task_id | BIGINT | NULL INDEX | Parent task ROWID (for subtasks) |
| title | VARCHAR(500) | NOT NULL | Task title |
| description | TEXT | NULL | Detailed description |
| type | VARCHAR(50) | NOT NULL DEFAULT 'TASK' | TASK\|STORY\|BUG\|SUBTASK\|EPIC |
| status | VARCHAR(100) | NOT NULL DEFAULT 'TODO' | Configurable via workflow_configs |
| priority | VARCHAR(50) | NOT NULL DEFAULT 'MEDIUM' | CRITICAL\|HIGH\|MEDIUM\|LOW |
| assignee_id | BIGINT | NULL INDEX | FK → users.ROWID |
| reporter_id | BIGINT | NOT NULL | FK → users.ROWID |
| story_points | DOUBLE | NULL | Estimation in story points |
| estimated_hours | DOUBLE | NULL | Hour estimate |
| logged_hours | DOUBLE | NOT NULL DEFAULT 0 | Aggregated from time_entries |
| due_date | DATETIME | NULL | Task due date |
| completed_at | DATETIME | NULL | Completion timestamp |
| labels | TEXT | NULL | JSON array of label strings |
| custom_fields | TEXT | NULL | JSON key-value for config-driven fields |
| created_by | BIGINT | NOT NULL | FK → users.ROWID |
| created_at | DATETIME | NOT NULL | |
| updated_at | DATETIME | NOT NULL | |

#### Table: `task_attachments`
| Column | Type | Constraints | Description |
|---|---|---|---|
| ROWID | BIGINT | PK auto | |
| tenant_id | BIGINT | NOT NULL INDEX | |
| task_id | BIGINT | NOT NULL INDEX | FK → tasks.ROWID |
| file_name | VARCHAR(255) | NOT NULL | Original file name |
| file_url | TEXT | NOT NULL | Stratus file URL |
| file_size_kb | DOUBLE | NULL | File size in KB |
| mime_type | VARCHAR(100) | NULL | MIME type |
| uploaded_by | BIGINT | NOT NULL | FK → users.ROWID |
| created_at | DATETIME | NOT NULL | |

#### Table: `task_comments`
| Column | Type | Constraints | Description |
|---|---|---|---|
| ROWID | BIGINT | PK auto | |
| tenant_id | BIGINT | NOT NULL INDEX | |
| task_id | BIGINT | NOT NULL INDEX | FK → tasks.ROWID |
| user_id | BIGINT | NOT NULL | FK → users.ROWID |
| content | TEXT | NOT NULL | Comment text |
| is_edited | BOOLEAN | NOT NULL DEFAULT false | |
| edited_at | DATETIME | NULL | |
| created_at | DATETIME | NOT NULL | |

#### Table: `task_status_history`
| Column | Type | Constraints | Description |
|---|---|---|---|
| ROWID | BIGINT | PK auto | |
| tenant_id | BIGINT | NOT NULL INDEX | |
| task_id | BIGINT | NOT NULL INDEX | FK → tasks.ROWID |
| from_status | VARCHAR(100) | NULL | Previous status |
| to_status | VARCHAR(100) | NOT NULL | New status |
| changed_by | BIGINT | NOT NULL | FK → users.ROWID |
| changed_at | DATETIME | NOT NULL | |
| time_in_status_hours | DOUBLE | NULL | Hours spent in previous status |

#### Table: `sprint_members`
| Column | Type | Constraints | Description |
|---|---|---|---|
| ROWID | BIGINT | PK auto | |
| tenant_id | BIGINT | NOT NULL INDEX | |
| sprint_id | BIGINT | NOT NULL INDEX | FK → sprints.ROWID |
| user_id | BIGINT | NOT NULL INDEX | FK → users.ROWID |
| capacity_hours | DOUBLE | NULL | Available hours this sprint |
| added_at | DATETIME | NOT NULL | |

---

### 4.2 TIME TRACKING SERVICE TABLES

#### Table: `time_entries`
| Column | Type | Constraints | Description |
|---|---|---|---|
| ROWID | BIGINT | PK auto | |
| tenant_id | BIGINT | NOT NULL INDEX | |
| project_id | BIGINT | NOT NULL INDEX | FK → projects.ROWID |
| task_id | BIGINT | NULL INDEX | FK → tasks.ROWID (optional) |
| user_id | BIGINT | NOT NULL INDEX | FK → users.ROWID |
| date | DATETIME | NOT NULL INDEX | Work date |
| hours | DOUBLE | NOT NULL | Hours logged (0.25 minimum) |
| description | TEXT | NULL | Work description |
| is_billable | BOOLEAN | NOT NULL DEFAULT true | Billable or internal |
| status | VARCHAR(50) | NOT NULL DEFAULT 'DRAFT' | DRAFT\|SUBMITTED\|APPROVED\|REJECTED |
| approved_by | BIGINT | NULL | FK → users.ROWID (RM) |
| approval_notes | TEXT | NULL | Reviewer notes |
| submitted_at | DATETIME | NULL | Submission timestamp |
| approved_at | DATETIME | NULL | Approval timestamp |
| created_at | DATETIME | NOT NULL | |
| updated_at | DATETIME | NOT NULL | |

#### Table: `time_approval_requests`
| Column | Type | Constraints | Description |
|---|---|---|---|
| ROWID | BIGINT | PK auto | |
| tenant_id | BIGINT | NOT NULL INDEX | |
| time_entry_id | BIGINT | NOT NULL INDEX | FK → time_entries.ROWID |
| requested_by | BIGINT | NOT NULL | FK → users.ROWID |
| assigned_to | BIGINT | NOT NULL INDEX | FK → users.ROWID (RM) |
| status | VARCHAR(50) | NOT NULL DEFAULT 'PENDING' | PENDING\|APPROVED\|REJECTED\|ESCALATED |
| notes | TEXT | NULL | Reviewer notes |
| escalated_to | BIGINT | NULL | FK → users.ROWID |
| escalated_at | DATETIME | NULL | |
| created_at | DATETIME | NOT NULL | |
| updated_at | DATETIME | NOT NULL | |

#### Table: `time_export_jobs`
| Column | Type | Constraints | Description |
|---|---|---|---|
| ROWID | BIGINT | PK auto | |
| tenant_id | BIGINT | NOT NULL INDEX | |
| requested_by | BIGINT | NOT NULL | FK → users.ROWID |
| filter_config | TEXT | NOT NULL | JSON: project_id, date_from, date_to, user_ids, is_billable |
| export_format | VARCHAR(20) | NOT NULL DEFAULT 'CSV' | CSV\|EXCEL |
| status | VARCHAR(50) | NOT NULL DEFAULT 'PENDING' | PENDING\|PROCESSING\|DONE\|FAILED |
| file_url | TEXT | NULL | Stratus download URL |
| created_at | DATETIME | NOT NULL | |
| completed_at | DATETIME | NULL | |

---

### 4.3 PEOPLE SERVICE TABLES

#### Table: `attendance_records`
| Column | Type | Constraints | Description |
|---|---|---|---|
| ROWID | BIGINT | PK auto | |
| tenant_id | BIGINT | NOT NULL INDEX | |
| user_id | BIGINT | NOT NULL INDEX | FK → users.ROWID |
| date | DATETIME | NOT NULL INDEX | Attendance date (Unique: tenant_id + user_id + date) |
| check_in_time | DATETIME | NULL | Check-in timestamp |
| check_out_time | DATETIME | NULL | Check-out timestamp |
| work_hours | DOUBLE | NULL | Calculated (check_out - check_in) |
| status | VARCHAR(50) | NOT NULL DEFAULT 'ABSENT' | PRESENT\|ABSENT\|WFH\|LATE\|HALF_DAY\|HOLIDAY\|ON_LEAVE |
| is_wfh | BOOLEAN | NOT NULL DEFAULT false | Work from home flag |
| wfh_reason | TEXT | NULL | WFH justification |
| is_location_verified | BOOLEAN | NOT NULL DEFAULT false | Network/IP verified |
| check_in_ip | VARCHAR(50) | NULL | IP address at check-in |
| override_reason | TEXT | NULL | Admin override justification |
| overridden_by | BIGINT | NULL | FK → users.ROWID |
| created_at | DATETIME | NOT NULL | |
| updated_at | DATETIME | NOT NULL | |

#### Table: `attendance_policies`
| Column | Type | Constraints | Description |
|---|---|---|---|
| ROWID | BIGINT | PK auto | |
| tenant_id | BIGINT | NOT NULL INDEX | |
| name | VARCHAR(255) | NOT NULL | Policy name |
| work_start_time | VARCHAR(10) | NOT NULL | HH:MM format |
| work_end_time | VARCHAR(10) | NOT NULL | HH:MM format |
| grace_minutes | BIGINT | NOT NULL DEFAULT 15 | Late grace period |
| required_hours | DOUBLE | NOT NULL DEFAULT 8 | Daily required hours |
| allowed_ips | TEXT | NULL | JSON array of allowed IP ranges |
| allowed_wifi_ssids | TEXT | NULL | JSON array of allowed SSIDs |
| network_restriction_enabled | BOOLEAN | NOT NULL DEFAULT false | |
| wfh_allowed | BOOLEAN | NOT NULL DEFAULT true | |
| is_active | BOOLEAN | NOT NULL DEFAULT true | |
| created_by | BIGINT | NOT NULL | FK → users.ROWID |
| created_at | DATETIME | NOT NULL | |

#### Table: `leave_types`
| Column | Type | Constraints | Description |
|---|---|---|---|
| ROWID | BIGINT | PK auto | |
| tenant_id | BIGINT | NOT NULL INDEX | |
| name | VARCHAR(100) | NOT NULL | Casual\|Sick\|Earned\|Maternity\|Paternity etc. |
| code | VARCHAR(20) | NOT NULL | CL\|SL\|EL\|ML\|PL |
| days_per_year | DOUBLE | NOT NULL | Annual allocation |
| carry_forward_days | DOUBLE | NOT NULL DEFAULT 0 | Max carry-forward to next year |
| requires_approval | BOOLEAN | NOT NULL DEFAULT true | |
| min_days | DOUBLE | NOT NULL DEFAULT 0.5 | Minimum days per request |
| max_days | DOUBLE | NOT NULL DEFAULT 30 | Maximum per request |
| notice_days | BIGINT | NOT NULL DEFAULT 1 | Advance notice required |
| is_paid | BOOLEAN | NOT NULL DEFAULT true | |
| is_active | BOOLEAN | NOT NULL DEFAULT true | |
| created_by | BIGINT | NOT NULL | |
| created_at | DATETIME | NOT NULL | |

#### Table: `leave_balances`
| Column | Type | Constraints | Description |
|---|---|---|---|
| ROWID | BIGINT | PK auto | |
| tenant_id | BIGINT | NOT NULL INDEX | |
| user_id | BIGINT | NOT NULL INDEX | FK → users.ROWID |
| leave_type_id | BIGINT | NOT NULL INDEX | FK → leave_types.ROWID |
| year | BIGINT | NOT NULL | Calendar year |
| opening_balance | DOUBLE | NOT NULL DEFAULT 0 | Start of year balance |
| total_allocated | DOUBLE | NOT NULL DEFAULT 0 | Total for year (with carry-forward) |
| used_days | DOUBLE | NOT NULL DEFAULT 0 | Days taken |
| pending_days | DOUBLE | NOT NULL DEFAULT 0 | Awaiting approval |
| remaining_days | DOUBLE | NOT NULL DEFAULT 0 | Available balance |
| updated_at | DATETIME | NOT NULL | |

#### Table: `leave_requests`
| Column | Type | Constraints | Description |
|---|---|---|---|
| ROWID | BIGINT | PK auto | |
| tenant_id | BIGINT | NOT NULL INDEX | |
| user_id | BIGINT | NOT NULL INDEX | FK → users.ROWID |
| leave_type_id | BIGINT | NOT NULL | FK → leave_types.ROWID |
| start_date | DATETIME | NOT NULL | Leave start |
| end_date | DATETIME | NOT NULL | Leave end |
| days_count | DOUBLE | NOT NULL | Calendar days (excluding weekends/holidays) |
| is_half_day | BOOLEAN | NOT NULL DEFAULT false | |
| half_day_session | VARCHAR(10) | NULL | MORNING\|AFTERNOON |
| reason | TEXT | NOT NULL | Leave reason |
| status | VARCHAR(50) | NOT NULL DEFAULT 'PENDING' | PENDING\|APPROVED\|REJECTED\|CANCELLED |
| reviewed_by | BIGINT | NULL | FK → users.ROWID (RM) |
| reviewer_notes | TEXT | NULL | |
| reviewed_at | DATETIME | NULL | |
| created_at | DATETIME | NOT NULL | |

#### Table: `leave_calendar`
| Column | Type | Constraints | Description |
|---|---|---|---|
| ROWID | BIGINT | PK auto | |
| tenant_id | BIGINT | NOT NULL INDEX | |
| date | DATETIME | NOT NULL INDEX | Calendar date |
| type | VARCHAR(50) | NOT NULL | HOLIDAY\|WEEKEND\|WORKING_DAY |
| name | VARCHAR(255) | NULL | Holiday name |
| is_optional | BOOLEAN | NOT NULL DEFAULT false | Optional holiday |
| year | BIGINT | NOT NULL | |

#### Table: `announcements`
| Column | Type | Constraints | Description |
|---|---|---|---|
| ROWID | BIGINT | PK auto | |
| tenant_id | BIGINT | NOT NULL INDEX | |
| title | VARCHAR(500) | NOT NULL | Announcement title |
| content | TEXT | NOT NULL | HTML content |
| type | VARCHAR(50) | NOT NULL DEFAULT 'GLOBAL' | GLOBAL\|ROLE_TARGETED\|USER_TARGETED |
| target_roles | TEXT | NULL | JSON array of roles |
| target_user_ids | TEXT | NULL | JSON array of user IDs |
| media_url | TEXT | NULL | Stratus image URL |
| is_pinned | BOOLEAN | NOT NULL DEFAULT false | Pin to top of feed |
| priority | VARCHAR(50) | NOT NULL DEFAULT 'NORMAL' | URGENT\|HIGH\|NORMAL\|LOW |
| expires_at | DATETIME | NULL | Auto-expire timestamp |
| view_count | BIGINT | NOT NULL DEFAULT 0 | |
| created_by | BIGINT | NOT NULL | FK → users.ROWID |
| created_at | DATETIME | NOT NULL | |
| updated_at | DATETIME | NOT NULL | |

#### Table: `announcement_reads`
| Column | Type | Constraints | Description |
|---|---|---|---|
| ROWID | BIGINT | PK auto | |
| tenant_id | BIGINT | NOT NULL INDEX | |
| announcement_id | BIGINT | NOT NULL INDEX | FK → announcements.ROWID |
| user_id | BIGINT | NOT NULL INDEX | FK → users.ROWID |
| read_at | DATETIME | NOT NULL | |

---

### 4.4 ASSET MANAGEMENT SERVICE TABLES

#### Table: `asset_categories`
| Column | Type | Constraints | Description |
|---|---|---|---|
| ROWID | BIGINT | PK auto | |
| tenant_id | BIGINT | NOT NULL INDEX | |
| name | VARCHAR(255) | NOT NULL | Laptop\|Monitor\|Phone\|Chair etc. |
| description | TEXT | NULL | |
| depreciation_years | BIGINT | NULL | Asset depreciation period |
| created_by | BIGINT | NOT NULL | |
| created_at | DATETIME | NOT NULL | |

#### Table: `assets`
| Column | Type | Constraints | Description |
|---|---|---|---|
| ROWID | BIGINT | PK auto | |
| tenant_id | BIGINT | NOT NULL INDEX | |
| category_id | BIGINT | NOT NULL INDEX | FK → asset_categories.ROWID |
| name | VARCHAR(500) | NOT NULL | Asset name/model |
| asset_tag | VARCHAR(100) | NOT NULL INDEX | Unique asset tag per tenant |
| serial_number | VARCHAR(255) | NULL | Manufacturer serial |
| brand | VARCHAR(255) | NULL | |
| model | VARCHAR(255) | NULL | |
| purchase_date | DATETIME | NULL | |
| purchase_value | DOUBLE | NULL | Purchase cost |
| current_value | DOUBLE | NULL | Depreciated value |
| warranty_expiry | DATETIME | NULL | |
| status | VARCHAR(50) | NOT NULL DEFAULT 'AVAILABLE' | AVAILABLE\|ASSIGNED\|MAINTENANCE\|RETIRED\|LOST |
| condition | VARCHAR(50) | NOT NULL DEFAULT 'GOOD' | NEW\|GOOD\|FAIR\|POOR |
| location | VARCHAR(500) | NULL | Physical location |
| document_url | TEXT | NULL | Stratus URL for asset docs |
| notes | TEXT | NULL | |
| assigned_to | BIGINT | NULL INDEX | FK → users.ROWID (current assignee) |
| assigned_at | DATETIME | NULL | |
| created_by | BIGINT | NOT NULL | |
| created_at | DATETIME | NOT NULL | |
| updated_at | DATETIME | NOT NULL | |

#### Table: `asset_requests`
| Column | Type | Constraints | Description |
|---|---|---|---|
| ROWID | BIGINT | PK auto | |
| tenant_id | BIGINT | NOT NULL INDEX | |
| requested_by | BIGINT | NOT NULL INDEX | FK → users.ROWID |
| category_id | BIGINT | NOT NULL | FK → asset_categories.ROWID |
| asset_id | BIGINT | NULL | FK → assets.ROWID (when fulfilled) |
| reason | TEXT | NOT NULL | Request justification |
| urgency | VARCHAR(50) | NOT NULL DEFAULT 'NORMAL' | URGENT\|HIGH\|NORMAL\|LOW |
| status | VARCHAR(50) | NOT NULL DEFAULT 'PENDING' | PENDING\|APPROVED\|REJECTED\|FULFILLED\|CANCELLED |
| approved_by | BIGINT | NULL | FK → users.ROWID |
| approved_at | DATETIME | NULL | |
| fulfilled_by | BIGINT | NULL | FK → users.ROWID (ops) |
| fulfilled_at | DATETIME | NULL | |
| fulfillment_notes | TEXT | NULL | |
| created_at | DATETIME | NOT NULL | |
| updated_at | DATETIME | NOT NULL | |

#### Table: `asset_assignments`
| Column | Type | Constraints | Description |
|---|---|---|---|
| ROWID | BIGINT | PK auto | |
| tenant_id | BIGINT | NOT NULL INDEX | |
| asset_id | BIGINT | NOT NULL INDEX | FK → assets.ROWID |
| user_id | BIGINT | NOT NULL INDEX | FK → users.ROWID |
| assigned_by | BIGINT | NOT NULL | FK → users.ROWID (ops) |
| request_id | BIGINT | NULL | FK → asset_requests.ROWID |
| assigned_date | DATETIME | NOT NULL | |
| expected_return_date | DATETIME | NULL | |
| returned_date | DATETIME | NULL | |
| condition_at_assignment | VARCHAR(50) | NOT NULL | NEW\|GOOD\|FAIR\|POOR |
| condition_at_return | VARCHAR(50) | NULL | |
| assignment_notes | TEXT | NULL | |
| return_notes | TEXT | NULL | |
| is_active | BOOLEAN | NOT NULL DEFAULT true | Current active assignment |

#### Table: `asset_maintenance`
| Column | Type | Constraints | Description |
|---|---|---|---|
| ROWID | BIGINT | PK auto | |
| tenant_id | BIGINT | NOT NULL INDEX | |
| asset_id | BIGINT | NOT NULL INDEX | FK → assets.ROWID |
| type | VARCHAR(100) | NOT NULL | PREVENTIVE\|CORRECTIVE\|INSPECTION |
| description | TEXT | NOT NULL | |
| scheduled_date | DATETIME | NOT NULL | |
| completed_date | DATETIME | NULL | |
| cost | DOUBLE | NULL | |
| performed_by | BIGINT | NULL | FK → users.ROWID |
| status | VARCHAR(50) | NOT NULL DEFAULT 'SCHEDULED' | SCHEDULED\|IN_PROGRESS\|COMPLETED\|CANCELLED |
| created_by | BIGINT | NOT NULL | |
| created_at | DATETIME | NOT NULL | |

---

### 4.5 BADGE & PROFILE SERVICE TABLES

#### Table: `user_profiles`
| Column | Type | Constraints | Description |
|---|---|---|---|
| ROWID | BIGINT | PK auto | |
| tenant_id | BIGINT | NOT NULL INDEX | |
| user_id | BIGINT | NOT NULL INDEX UNIQUE | FK → users.ROWID |
| bio | TEXT | NULL | Personal bio |
| photo_url | TEXT | NULL | Stratus profile photo URL |
| date_of_joining | DATETIME | NULL | Employment start date |
| department | VARCHAR(255) | NULL | Department name |
| designation | VARCHAR(255) | NULL | Job title |
| employee_id | VARCHAR(100) | NULL | HR employee ID |
| reporting_manager_id | BIGINT | NULL INDEX | FK → users.ROWID |
| skills | TEXT | NULL | JSON array: [{name, level, category}] |
| experience | TEXT | NULL | JSON array: [{company, role, from, to, desc}] |
| certifications | TEXT | NULL | JSON array: [{name, issuer, date, url}] |
| resume_url | TEXT | NULL | Stratus resume URL |
| social_links | TEXT | NULL | JSON: {linkedin, github, twitter, portfolio} |
| phone | VARCHAR(20) | NULL | |
| timezone | VARCHAR(100) | NULL DEFAULT 'Asia/Kolkata' | |
| is_profile_public | BOOLEAN | NOT NULL DEFAULT false | |
| created_at | DATETIME | NOT NULL | |
| updated_at | DATETIME | NOT NULL | |

#### Table: `badge_definitions`
| Column | Type | Constraints | Description |
|---|---|---|---|
| ROWID | BIGINT | PK auto | |
| tenant_id | BIGINT | NOT NULL INDEX | |
| name | VARCHAR(255) | NOT NULL | Badge name |
| category | VARCHAR(100) | NOT NULL | PERFORMANCE\|COLLABORATION\|INNOVATION\|LEADERSHIP\|SPECIAL |
| level | VARCHAR(50) | NOT NULL DEFAULT 'BRONZE' | BRONZE\|SILVER\|GOLD\|PLATINUM |
| description | TEXT | NOT NULL | Badge criteria description |
| logo_url | TEXT | NULL | Stratus logo URL |
| criteria | TEXT | NULL | JSON: specific criteria for auto-award |
| is_auto_awardable | BOOLEAN | NOT NULL DEFAULT false | Can AI auto-award? |
| auto_award_config | TEXT | NULL | JSON: conditions for auto-award |
| is_active | BOOLEAN | NOT NULL DEFAULT true | |
| created_by | BIGINT | NOT NULL | FK → users.ROWID |
| created_at | DATETIME | NOT NULL | |

#### Table: `user_badges`
| Column | Type | Constraints | Description |
|---|---|---|---|
| ROWID | BIGINT | PK auto | |
| tenant_id | BIGINT | NOT NULL INDEX | |
| user_id | BIGINT | NOT NULL INDEX | FK → users.ROWID |
| badge_id | BIGINT | NOT NULL INDEX | FK → badge_definitions.ROWID |
| awarded_by | BIGINT | NOT NULL | FK → users.ROWID |
| awarded_at | DATETIME | NOT NULL | |
| reason | TEXT | NOT NULL | Award justification |
| is_featured | BOOLEAN | NOT NULL DEFAULT false | Show prominently on profile |
| is_public | BOOLEAN | NOT NULL DEFAULT true | Visible to others |

---

### 4.6 ADMIN CONFIG SERVICE TABLES

#### Table: `workflow_configs`
| Column | Type | Constraints | Description |
|---|---|---|---|
| ROWID | BIGINT | PK auto | |
| tenant_id | BIGINT | NOT NULL INDEX | |
| entity_type | VARCHAR(100) | NOT NULL | task\|blocker\|leave\|asset_request\|time_entry |
| name | VARCHAR(255) | NOT NULL | Workflow name |
| statuses | TEXT | NOT NULL | JSON array: [{id, name, color, is_terminal, position}] |
| transitions | TEXT | NOT NULL | JSON array: [{from, to, requires_role, requires_comment}] |
| is_default | BOOLEAN | NOT NULL DEFAULT false | Default for entity type |
| is_active | BOOLEAN | NOT NULL DEFAULT true | |
| created_by | BIGINT | NOT NULL | FK → users.ROWID |
| created_at | DATETIME | NOT NULL | |
| updated_at | DATETIME | NOT NULL | |

#### Table: `form_configs`
| Column | Type | Constraints | Description |
|---|---|---|---|
| ROWID | BIGINT | PK auto | |
| tenant_id | BIGINT | NOT NULL INDEX | |
| form_type | VARCHAR(100) | NOT NULL | task_create\|standup\|leave_request\|asset_request |
| fields | TEXT | NOT NULL | JSON array: [{id, label, type, required, options, order}] |
| validations | TEXT | NULL | JSON: field-level validation rules |
| is_active | BOOLEAN | NOT NULL DEFAULT true | |
| version | BIGINT | NOT NULL DEFAULT 1 | Schema version for migration |
| created_by | BIGINT | NOT NULL | |
| created_at | DATETIME | NOT NULL | |
| updated_at | DATETIME | NOT NULL | |

#### Table: `permission_overrides`
| Column | Type | Constraints | Description |
|---|---|---|---|
| ROWID | BIGINT | PK auto | |
| tenant_id | BIGINT | NOT NULL INDEX | |
| role | VARCHAR(100) | NOT NULL | Role being overridden |
| permissions | TEXT | NOT NULL | JSON array of permission strings |
| overridden_by | BIGINT | NOT NULL | FK → users.ROWID |
| reason | TEXT | NULL | |
| is_active | BOOLEAN | NOT NULL DEFAULT true | |
| created_at | DATETIME | NOT NULL | |
| updated_at | DATETIME | NOT NULL | |

#### Table: `feature_flags`
| Column | Type | Constraints | Description |
|---|---|---|---|
| ROWID | BIGINT | PK auto | |
| tenant_id | BIGINT | NOT NULL INDEX | |
| feature_name | VARCHAR(100) | NOT NULL INDEX | Unique feature key |
| is_enabled | BOOLEAN | NOT NULL DEFAULT false | |
| config | TEXT | NULL | JSON feature-specific config |
| enabled_for_roles | TEXT | NULL | JSON array: roles with access |
| enabled_for_users | TEXT | NULL | JSON array: specific user IDs |
| updated_by | BIGINT | NOT NULL | FK → users.ROWID |
| updated_at | DATETIME | NOT NULL | |

#### Table: `project_permissions`
| Column | Type | Constraints | Description |
|---|---|---|---|
| ROWID | BIGINT | PK auto | |
| tenant_id | BIGINT | NOT NULL INDEX | |
| project_id | BIGINT | NOT NULL INDEX | FK → projects.ROWID |
| user_id | BIGINT | NOT NULL INDEX | FK → users.ROWID |
| permissions | TEXT | NOT NULL | JSON array of permission strings |
| granted_by | BIGINT | NOT NULL | FK → users.ROWID |
| created_at | DATETIME | NOT NULL | |
| updated_at | DATETIME | NOT NULL | |

---

### 4.7 NOTIFICATION PREFERENCES TABLE (Extend Existing)

#### Table: `notification_preferences`
| Column | Type | Constraints | Description |
|---|---|---|---|
| ROWID | BIGINT | PK auto | |
| tenant_id | BIGINT | NOT NULL INDEX | |
| user_id | BIGINT | NOT NULL INDEX | FK → users.ROWID |
| notification_type | VARCHAR(100) | NOT NULL | See notification types |
| is_email_enabled | BOOLEAN | NOT NULL DEFAULT true | |
| is_inapp_enabled | BOOLEAN | NOT NULL DEFAULT true | |
| is_push_enabled | BOOLEAN | NOT NULL DEFAULT false | |
| updated_at | DATETIME | NOT NULL | |

---

### 4.8 CATALYST SQL TABLES (Analytics Layer)

These are created in Catalyst SQL (not DataStore). Populated by nightly cron.

```sql
-- Sprint velocity history
CREATE TABLE sprint_velocity_history (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  tenant_id BIGINT NOT NULL,
  project_id BIGINT NOT NULL,
  sprint_id BIGINT NOT NULL,
  sprint_name VARCHAR(255),
  planned_points DOUBLE,
  completed_points DOUBLE,
  completion_rate DOUBLE,
  sprint_start DATE,
  sprint_end DATE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_project (tenant_id, project_id)
);

-- Project health snapshots (daily)
CREATE TABLE project_health_snapshots (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  tenant_id BIGINT NOT NULL,
  project_id BIGINT NOT NULL,
  snapshot_date DATE NOT NULL,
  rag_status VARCHAR(10),
  health_score DOUBLE,
  open_blockers INT,
  overdue_milestones INT,
  open_risks INT,
  standup_compliance_rate DOUBLE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_project_date (tenant_id, project_id, snapshot_date)
);

-- Time entries aggregated by user/project/week
CREATE TABLE time_entries_weekly_agg (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  tenant_id BIGINT NOT NULL,
  user_id BIGINT NOT NULL,
  project_id BIGINT NOT NULL,
  week_start DATE NOT NULL,
  week_end DATE NOT NULL,
  total_hours DOUBLE,
  billable_hours DOUBLE,
  approved_hours DOUBLE,
  entry_count INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_user_week (tenant_id, user_id, week_start)
);

-- Attendance monthly summary
CREATE TABLE attendance_monthly_summary (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  tenant_id BIGINT NOT NULL,
  user_id BIGINT NOT NULL,
  year INT NOT NULL,
  month INT NOT NULL,
  present_days INT,
  absent_days INT,
  wfh_days INT,
  late_days INT,
  total_work_hours DOUBLE,
  avg_hours_per_day DOUBLE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_user_month (tenant_id, user_id, year, month)
);

-- User performance scores (weekly computed)
CREATE TABLE user_performance_scores (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  tenant_id BIGINT NOT NULL,
  user_id BIGINT NOT NULL,
  week_start DATE NOT NULL,
  standup_score DOUBLE,
  delivery_score DOUBLE,
  collaboration_score DOUBLE,
  attendance_score DOUBLE,
  overall_score DOUBLE,
  burnout_risk_level VARCHAR(20),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_user_week (tenant_id, user_id, week_start)
);
```

---

## 5. API DESIGN

### 5.1 Task & Sprint Service — `/server/task_sprint_service`

```
Base: /api/ts

SPRINTS
GET    /sprints                          — List sprints (project_id filter)
POST   /sprints                          — Create sprint [SPRINT_WRITE]
GET    /sprints/:sprintId               — Get sprint with task summary
PUT    /sprints/:sprintId               — Update sprint [SPRINT_WRITE]
PATCH  /sprints/:sprintId/start         — Start sprint (PLANNING → ACTIVE) [SPRINT_WRITE]
PATCH  /sprints/:sprintId/complete      — Complete sprint [SPRINT_WRITE]
GET    /sprints/:sprintId/board         — Kanban board (tasks grouped by status)
GET    /sprints/:sprintId/velocity      — Velocity metrics
POST   /sprints/:sprintId/members       — Add member to sprint [SPRINT_WRITE]
DELETE /sprints/:sprintId/members/:uid  — Remove member [SPRINT_WRITE]

BACKLOG
GET    /backlog                          — Unsprinted tasks for project (project_id filter)
POST   /backlog/:taskId/sprint/:sprintId — Move task to sprint [TASK_WRITE]
POST   /backlog/:taskId/unassign        — Remove from sprint → backlog [TASK_WRITE]

TASKS
GET    /tasks                            — List tasks (filters: sprint_id, assignee, status, type)
POST   /tasks                            — Create task [TASK_WRITE]
GET    /tasks/:taskId                    — Get task with subtasks and comments
PUT    /tasks/:taskId                    — Update task [TASK_WRITE]
DELETE /tasks/:taskId                    — Delete task [TASK_WRITE]
PATCH  /tasks/:taskId/status            — Update task status [TASK_WRITE]
PATCH  /tasks/:taskId/assign            — Reassign task [TASK_WRITE]
PATCH  /tasks/:taskId/move-sprint       — Move to different sprint [TASK_WRITE]
GET    /tasks/:taskId/history           — Status change history
GET    /tasks/:taskId/comments          — Task comments
POST   /tasks/:taskId/comments          — Add comment [TASK_COMMENT_WRITE]
DELETE /tasks/:taskId/comments/:cid     — Delete comment [TASK_COMMENT_WRITE]
POST   /tasks/:taskId/attachments       — Upload attachment (multipart → Stratus) [TASK_WRITE]
DELETE /tasks/:taskId/attachments/:aid  — Delete attachment [TASK_WRITE]
GET    /tasks/my-tasks                  — Authenticated user's tasks across projects
GET    /tasks/overdue                   — Overdue tasks for tenant [TASK_READ]
```

### 5.2 Time Tracking Service — `/server/time_tracking_service`

```
Base: /api/time

TIME ENTRIES
GET    /entries                          — List entries (filters: user_id, project_id, date_range, status)
POST   /entries                          — Create entry [TIME_WRITE]
GET    /entries/:entryId                — Get entry
PUT    /entries/:entryId                — Update entry (DRAFT only) [TIME_WRITE]
DELETE /entries/:entryId                — Delete entry (DRAFT only) [TIME_WRITE]
PATCH  /entries/:entryId/submit         — Submit for approval [TIME_WRITE]
PATCH  /entries/:entryId/retract        — Pull back submitted entry [TIME_WRITE]
GET    /entries/my-week                 — Current user's this week summary
GET    /entries/summary                 — Aggregated hours by project/user/date [TIME_READ]
POST   /entries/bulk-submit             — Submit multiple entries [TIME_WRITE]

APPROVALS
GET    /approvals                        — Pending approvals for RM [TIME_APPROVE]
GET    /approvals/history               — Approval history [TIME_APPROVE]
PATCH  /approvals/:requestId/approve    — Approve time entry [TIME_APPROVE]
PATCH  /approvals/:requestId/reject     — Reject with notes [TIME_APPROVE]
PATCH  /approvals/:requestId/escalate   — Escalate to senior [TIME_APPROVE]

EXPORTS
POST   /export                          — Trigger export job [TIME_READ]
GET    /export/:jobId/status            — Check export job status
GET    /export/:jobId/download          — Download file (Stratus redirect)

REPORTS
GET    /reports/billable-summary        — Billable vs non-billable [TIME_READ]
GET    /reports/user-hours              — Per-user hours in date range [TIME_READ]
GET    /reports/project-hours           — Per-project breakdown [TIME_READ]
```

### 5.3 People Service — `/server/people_service`

```
Base: /api/people

ATTENDANCE
POST   /attendance/check-in             — Record check-in [ATTENDANCE_WRITE]
POST   /attendance/check-out            — Record check-out [ATTENDANCE_WRITE]
GET    /attendance/live                 — Who is checked in right now [ATTENDANCE_READ]
GET    /attendance/my-record            — Current user's attendance log
GET    /attendance/records              — Team attendance (filters: user_id, date_range) [ATTENDANCE_READ]
POST   /attendance/wfh                  — Mark WFH for today [ATTENDANCE_WRITE]
PATCH  /attendance/:recordId/override   — Admin override attendance [ATTENDANCE_ADMIN]
GET    /attendance/anomalies            — Late/absent anomalies [ATTENDANCE_READ]
GET    /attendance/summary              — Monthly summary per user [ATTENDANCE_READ]

LEAVE
GET    /leave/types                     — List leave types [LEAVE_READ]
POST   /leave/types                     — Create leave type [LEAVE_ADMIN]
PUT    /leave/types/:typeId             — Update leave type [LEAVE_ADMIN]
GET    /leave/balance                   — Current user's balance
GET    /leave/balance/:userId           — Get user's leave balance [LEAVE_READ]
POST   /leave/request                   — Apply for leave [LEAVE_WRITE]
GET    /leave/requests                  — List requests (own + team for RM) [LEAVE_READ]
GET    /leave/requests/:requestId       — Get request details
PUT    /leave/requests/:requestId       — Update pending request [LEAVE_WRITE]
DELETE /leave/requests/:requestId       — Cancel request [LEAVE_WRITE]
PATCH  /leave/requests/:requestId/approve  — Approve leave [LEAVE_APPROVE]
PATCH  /leave/requests/:requestId/reject   — Reject leave [LEAVE_APPROVE]
GET    /leave/calendar                  — Team leave calendar view [LEAVE_READ]
GET    /leave/overlaps                  — Check overlap for date range [LEAVE_READ]

ANNOUNCEMENTS
GET    /announcements                   — List visible announcements for user
POST   /announcements                   — Create announcement [ANNOUNCEMENT_WRITE]
PUT    /announcements/:id               — Update announcement [ANNOUNCEMENT_WRITE]
DELETE /announcements/:id               — Delete announcement [ANNOUNCEMENT_WRITE]
PATCH  /announcements/:id/read          — Mark as read
GET    /announcements/:id/read-status   — Who has read it [ANNOUNCEMENT_READ]

ORG HIERARCHY
GET    /org/hierarchy                   — Full org tree for tenant [ORG_READ]
GET    /org/reports/:userId             — Direct reports for a manager [ORG_READ]
GET    /org/manager/:userId             — Get reporting manager [ORG_READ]
PUT    /org/manager                     — Assign/change reporting manager [ORG_WRITE]
```

### 5.4 Asset Service — `/server/asset_service`

```
Base: /api/assets

CATEGORIES
GET    /categories                      — List categories [ASSET_READ]
POST   /categories                      — Create category [ASSET_ADMIN]
PUT    /categories/:catId               — Update category [ASSET_ADMIN]

INVENTORY
GET    /inventory                       — Full inventory list (filters: status, category, assigned_to) [ASSET_READ]
POST   /inventory                       — Add asset [ASSET_WRITE]
GET    /inventory/:assetId              — Asset details with history
PUT    /inventory/:assetId              — Update asset [ASSET_WRITE]
PATCH  /inventory/:assetId/retire       — Mark as retired [ASSET_WRITE]
PATCH  /inventory/:assetId/maintenance  — Send to maintenance [ASSET_WRITE]
POST   /inventory/:assetId/documents    — Upload document (→ Stratus) [ASSET_WRITE]
GET    /inventory/available             — Available assets by category [ASSET_READ]
GET    /inventory/my-assets             — Assets assigned to current user

REQUESTS
GET    /requests                        — List requests (own for members, all for ops/admin) [ASSET_READ]
POST   /requests                        — Raise asset request [ASSET_READ]
GET    /requests/:requestId             — Request details
PATCH  /requests/:requestId/approve     — Approve request [ASSET_APPROVE]
PATCH  /requests/:requestId/reject      — Reject request [ASSET_APPROVE]
PATCH  /requests/:requestId/fulfill     — Fulfill and assign asset [ASSET_ASSIGN]

ASSIGNMENTS
GET    /assignments                     — Assignment history (filters: user_id, asset_id) [ASSET_READ]
POST   /assignments                     — Direct assignment (ops) [ASSET_ASSIGN]
PATCH  /assignments/:assignmentId/return — Record asset return [ASSET_ASSIGN]

MAINTENANCE
GET    /maintenance                     — Maintenance schedule [ASSET_READ]
POST   /maintenance                     — Schedule maintenance [ASSET_WRITE]
PATCH  /maintenance/:id/complete        — Mark maintenance complete [ASSET_WRITE]

REPORTS
GET    /reports/utilization             — Asset utilization report [ASSET_READ]
GET    /reports/aging                   — Assets by age/depreciation [ASSET_READ]
```

### 5.5 Badge & Profile Service — `/server/badge_profile_service`

```
Base: /api/bp

PROFILES
GET    /profiles/me                     — Own profile
GET    /profiles/:userId                — Get user profile [PROFILE_READ]
PUT    /profiles/me                     — Update own profile [PROFILE_WRITE]
POST   /profiles/me/photo               — Upload profile photo (→ Stratus)
DELETE /profiles/me/photo               — Remove photo
POST   /profiles/me/resume              — Upload resume (→ Stratus)
GET    /profiles/directory              — Team directory with profiles [PROFILE_READ]
GET    /profiles/:userId/badges         — User's badges
GET    /profiles/:userId/skills         — User's skills for assignment suggestions

BADGES
GET    /badges                          — List badge definitions [BADGE_READ]
POST   /badges                          — Create badge [BADGE_WRITE]
PUT    /badges/:badgeId                 — Update badge [BADGE_WRITE]
DELETE /badges/:badgeId                 — Deactivate badge [BADGE_WRITE]
POST   /badges/:badgeId/logo            — Upload badge logo (→ Stratus)
POST   /badges/:badgeId/award           — Award badge to user [BADGE_AWARD]
DELETE /user-badges/:awardId            — Revoke badge [BADGE_AWARD]
GET    /badges/leaderboard              — Top badge earners [BADGE_READ]
GET    /badges/available-for-award      — Badges I can award [BADGE_READ]
```

### 5.6 Admin Config Service — `/server/admin_config_service`

```
Base: /api/config

WORKFLOWS
GET    /workflows                       — List workflow configs [CONFIG_READ]
POST   /workflows                       — Create workflow [CONFIG_WRITE]
PUT    /workflows/:workflowId           — Update workflow [CONFIG_WRITE]
DELETE /workflows/:workflowId           — Delete workflow [CONFIG_WRITE]
POST   /workflows/:workflowId/activate  — Set as default for entity type [CONFIG_WRITE]

FORMS
GET    /forms                           — List form configs [CONFIG_READ]
POST   /forms                           — Create form config [CONFIG_WRITE]
PUT    /forms/:formId                   — Update form [CONFIG_WRITE]
GET    /forms/:formType/active          — Get active form for entity type [CONFIG_READ]

PERMISSIONS
GET    /permissions/matrix              — Full RBAC matrix [CONFIG_READ]
GET    /permissions/role/:role          — Permissions for a role [CONFIG_READ]
PUT    /permissions/role/:role          — Override role permissions [CONFIG_WRITE]
POST   /permissions/project             — Grant project-level permissions [CONFIG_WRITE]
DELETE /permissions/project/:overrideId — Revoke project permissions [CONFIG_WRITE]

FEATURE FLAGS
GET    /features                        — List feature flags [CONFIG_READ]
POST   /features                        — Create feature flag [CONFIG_WRITE]
PUT    /features/:flagName              — Toggle / update feature flag [CONFIG_WRITE]
GET    /features/enabled                — Features enabled for current user (client-side check)

IMPORT / MIGRATION
POST   /migration/import                — Bulk data import endpoint [ADMIN_ONLY]
GET    /migration/status/:jobId         — Import job status
POST   /migration/validate              — Validate import file format
```

### 5.7 Reporting Service — `/server/reporting_service`

```
Base: /api/reports-v2

CROSS-SERVICE REPORTS
GET    /delivery-health                 — Combined delivery health (projects + sprints + blockers) [REPORT_READ]
GET    /people-summary                  — Attendance + leave summary per user [REPORT_READ]
GET    /time-summary                    — Time tracking summary cross-project [REPORT_READ]
GET    /asset-summary                   — Asset utilization summary [REPORT_READ]
GET    /executive-brief                 — Full executive brief (feeds CEO dashboard) [REPORT_READ]
POST   /custom                          — Custom report (date range + modules) [REPORT_WRITE]

PDF EXPORT (SmartBrowz)
POST   /pdf/sprint-retro/:sprintId      — Generate retro PDF [REPORT_READ]
POST   /pdf/time-invoice                — Billable hours invoice PDF [REPORT_WRITE]
POST   /pdf/user-performance/:userId    — User performance report PDF [REPORT_READ]
GET    /pdf/:jobId/download             — Download generated PDF

PUBLIC LINKS
POST   /public/:reportId/share          — Generate public share link [REPORT_WRITE]
GET    /public/:token                   — Access report via share token (no auth)
```

---

## 6. EVENT-DRIVEN FLOWS — SIGNALS

### 6.1 Event Schema Registry

```javascript
// Catalyst Signals Event Definitions

const SIGNAL_EVENTS = {
  // Task & Sprint
  TASK_CREATED:            { publisher: 'task_sprint_service', schema: { taskId, assigneeId, projectId, tenantId } },
  TASK_STATUS_CHANGED:     { publisher: 'task_sprint_service', schema: { taskId, fromStatus, toStatus, changedBy, projectId, tenantId } },
  TASK_ASSIGNED:           { publisher: 'task_sprint_service', schema: { taskId, oldAssigneeId, newAssigneeId, tenantId } },
  SPRINT_STARTED:          { publisher: 'task_sprint_service', schema: { sprintId, projectId, teamUserIds, tenantId } },
  SPRINT_COMPLETED:        { publisher: 'task_sprint_service', schema: { sprintId, velocity, completionRate, tenantId } },

  // Time Tracking
  TIME_ENTRY_SUBMITTED:    { publisher: 'time_tracking_service', schema: { entryId, userId, rmId, hours, projectId, tenantId } },
  TIME_ENTRY_APPROVED:     { publisher: 'time_tracking_service', schema: { entryId, userId, approvedBy, tenantId } },
  TIME_ENTRY_REJECTED:     { publisher: 'time_tracking_service', schema: { entryId, userId, rejectedBy, notes, tenantId } },

  // People
  LEAVE_REQUESTED:         { publisher: 'people_service', schema: { requestId, userId, rmId, startDate, endDate, leaveType, tenantId } },
  LEAVE_APPROVED:          { publisher: 'people_service', schema: { requestId, userId, approvedBy, tenantId } },
  LEAVE_REJECTED:          { publisher: 'people_service', schema: { requestId, userId, rejectedBy, notes, tenantId } },
  ATTENDANCE_ANOMALY:      { publisher: 'people_service', schema: { userId, date, anomalyType, tenantId } },

  // Assets
  ASSET_REQUESTED:         { publisher: 'asset_service', schema: { requestId, userId, categoryName, urgency, tenantId } },
  ASSET_APPROVED:          { publisher: 'asset_service', schema: { requestId, userId, approvedBy, tenantId } },
  ASSET_ASSIGNED:          { publisher: 'asset_service', schema: { assetId, userId, assignedBy, tenantId } },

  // Badges
  BADGE_AWARDED:           { publisher: 'badge_profile_service', schema: { badgeId, userId, awardedBy, badgeName, tenantId } },

  // Announcements
  ANNOUNCEMENT_PUBLISHED:  { publisher: 'people_service', schema: { announcementId, targetRoles, tenantId } },

  // AI Triggers
  AI_ANALYSIS_TRIGGER:     { publisher: 'any_service', schema: { analysisType, entityId, tenantId } },
};
```

### 6.2 Signal Flow Diagrams

#### Flow 1: Task Assignment → Notification
```
task_sprint_service
  └─ POST /tasks (createTask)
      └─ assignee_id set
          └─ Signals.publish(TASK_CREATED, { taskId, assigneeId, ... })
              └─ delivery_sync_function (subscriber)
                  └─ NotificationService.send({
                       type: 'TASK_ASSIGNED',
                       userId: assigneeId,
                       message: 'You have been assigned a new task: [title]'
                     })
                  └─ AuditService.log(TASK, CREATE, ...)
```

#### Flow 2: Time Entry → RM Approval → Notification Chain
```
time_tracking_service
  └─ PATCH /entries/:id/submit
      └─ Signals.publish(TIME_ENTRY_SUBMITTED, { entryId, userId, rmId, hours, ... })
          ├─ delivery_sync_function (subscriber)
          │   └─ NotificationService.send({ userId: rmId, type: 'TIME_APPROVAL_NEEDED' })
          └─ [RM approves via PATCH /approvals/:id/approve]
              └─ Signals.publish(TIME_ENTRY_APPROVED, { entryId, userId, ... })
                  └─ delivery_sync_function (subscriber)
                      └─ NotificationService.send({ userId, type: 'TIME_ENTRY_APPROVED' })

[If RM ignores > 2 days → Cron job escalates → Signals.publish(TIME_ENTRY_SUBMITTED escalation)]
```

#### Flow 3: Leave Request → RM → Calendar Update
```
people_service
  └─ POST /leave/request
      ├─ Check leave balance (leave_balances)
      ├─ Check overlap (leave_calendar + existing leave_requests)
      ├─ Insert leave_requests (status: PENDING)
      ├─ Update leave_balances.pending_days += days_count
      └─ Signals.publish(LEAVE_REQUESTED, { requestId, userId, rmId, ... })
          └─ delivery_sync_function (subscriber)
              └─ NotificationService.send({ userId: rmId, type: 'LEAVE_APPROVAL_NEEDED' })

[RM approves]
  └─ PATCH /leave/requests/:id/approve
      ├─ Update leave_requests.status = 'APPROVED'
      ├─ Update leave_balances.used_days += days_count, pending_days -= days_count
      ├─ Insert leave_calendar entries (status: ON_LEAVE)
      └─ Signals.publish(LEAVE_APPROVED, { requestId, userId, ... })
          └─ delivery_sync_function (subscriber)
              └─ NotificationService.send({ userId, type: 'LEAVE_APPROVED' })
```

#### Flow 4: Asset Request → Ops Fulfillment
```
asset_service
  └─ POST /requests
      └─ Signals.publish(ASSET_REQUESTED, { requestId, userId, categoryName, urgency, ... })
          └─ delivery_sync_function (subscriber)
              └─ NotificationService.broadcastToRole('OPS_ADMIN', 'ASSET_REQUEST_RAISED')

[Manager approves]
  └─ PATCH /requests/:id/approve
      └─ Signals.publish(ASSET_APPROVED, ...)
          └─ NotificationService.send({ userId: ops_team, type: 'ASSET_TO_FULFILL' })

[Ops fulfills]
  └─ PATCH /requests/:id/fulfill (assigns assetId)
      ├─ Update assets.status = 'ASSIGNED', assigned_to = userId
      ├─ Insert asset_assignments record
      └─ Signals.publish(ASSET_ASSIGNED, { assetId, userId, ... })
          └─ NotificationService.send({ userId, type: 'ASSET_ASSIGNED' })
```

#### Flow 5: AI Auto-Badge Award
```
ai_service (weekly cron)
  └─ Analyzes user_performance_scores
      └─ Identifies top performers (score ≥ 90)
          └─ Signals.publish(AI_ANALYSIS_TRIGGER, { analysisType: 'BADGE_AUTO_AWARD', userId, ... })
              └─ badge_profile_service (subscriber)
                  └─ Check badge_definitions.is_auto_awardable = true
                  └─ Insert user_badges (awarded_by: AI_SYSTEM_USER)
                  └─ Signals.publish(BADGE_AWARDED, ...)
                      └─ NotificationService.send({ userId, type: 'BADGE_AWARDED' })
```

### 6.3 Signal Targets Configuration (Catalyst Console)

```
Signal Rule: TASK_CREATED
  Publisher: task_sprint_service
  Target 1: delivery_sync_function (type: Serverless Function)
  Target 2: ai_service (type: Serverless Function) — optional AI trigger

Signal Rule: TIME_ENTRY_SUBMITTED
  Publisher: time_tracking_service
  Target 1: delivery_sync_function

Signal Rule: LEAVE_REQUESTED
  Publisher: people_service
  Target 1: delivery_sync_function

Signal Rule: ASSET_REQUESTED
  Publisher: asset_service
  Target 1: delivery_sync_function

Signal Rule: BADGE_AWARDED
  Publisher: badge_profile_service
  Target 1: delivery_sync_function

Signal Rule: ATTENDANCE_ANOMALY
  Publisher: people_service
  Target 1: delivery_sync_function
  Target 2: ai_service
```

---

## 7. AI SYSTEM DESIGN

### 7.1 Extended AI Endpoints (added to existing `ai_service`)

```
POST /api/ai/burnout-detection          — Detect burnout risk per user
POST /api/ai/sprint-prediction          — Predict sprint completion
POST /api/ai/team-capacity              — Capacity planning recommendations
POST /api/ai/badge-suggestions          — AI badge award recommendations
POST /api/ai/skill-gap                  — Skill gap analysis
POST /api/ai/leave-pattern              — Leave pattern analysis
POST /api/ai/time-anomaly               — Time entry anomaly detection
POST /api/ai/asset-forecast             — Asset demand forecasting
POST /api/ai/chat                       — ConvoKraft NLP chat interface
```

### 7.2 Prompt Templates

#### Prompt 1: Burnout Detection
```javascript
const BURNOUT_DETECTION_PROMPT = (userData) => `
You are a team health analyst. Analyze the following data for employee burnout risk.

## Employee Data (Last 14 Days)
- Name: ${userData.name}
- Average daily work hours: ${userData.avgHours}
- EOD mood trend: ${userData.moodTrend} (sequence of GREEN/YELLOW/RED)
- Standup completion rate: ${userData.standupRate}%
- Overdue tasks: ${userData.overdueTasks}
- Leave taken in period: ${userData.leaveDays} days
- EOD accomplishment excerpts: ${userData.eodExcerpts.join(' | ')}
- Blocker count raised: ${userData.blockersRaised}

## Task
Return a JSON response with this exact structure:
{
  "burnout_risk": "LOW|MEDIUM|HIGH|CRITICAL",
  "confidence": 0.0-1.0,
  "indicators": ["indicator1", "indicator2"],
  "recommendations": ["action1", "action2"],
  "suggested_actions": {
    "for_manager": ["action"],
    "for_hr": ["action"],
    "for_employee": ["action"]
  }
}
`;
```

#### Prompt 2: Sprint Completion Prediction
```javascript
const SPRINT_PREDICTION_PROMPT = (sprintData) => `
You are an agile delivery expert. Predict sprint completion likelihood.

## Sprint Data
- Sprint: ${sprintData.name}, Days remaining: ${sprintData.daysRemaining}
- Total story points: ${sprintData.totalPoints}, Completed: ${sprintData.completedPoints}
- In-progress tasks: ${sprintData.inProgressCount}, Blocked tasks: ${sprintData.blockedCount}
- Team velocity (last 3 sprints): ${sprintData.historicalVelocity.join(', ')}
- Active blockers: ${sprintData.activeBlockers}
- Current team capacity (available days × hours): ${sprintData.remainingCapacity}

## Task
Return a JSON response:
{
  "completion_probability": 0.0-1.0,
  "predicted_completion_points": number,
  "risk_level": "LOW|MEDIUM|HIGH",
  "at_risk_tasks": ["task title"],
  "recommendations": ["recommendation"],
  "scope_change_suggestion": "string or null"
}
`;
```

#### Prompt 3: Natural Language Query (Extended)
```javascript
const NL_QUERY_PROMPT = (query, contextData) => `
You are the Delivery Sync AI assistant. Answer the user's question using ONLY the data provided.

## User Query
"${query}"

## Available Data
### Projects
${JSON.stringify(contextData.projects)}

### Sprint Status
${JSON.stringify(contextData.sprints)}

### Attendance Today
${JSON.stringify(contextData.attendance)}

### Leave This Week
${JSON.stringify(contextData.leaves)}

### Open Blockers
${JSON.stringify(contextData.blockers)}

### Recent Time Entries
${JSON.stringify(contextData.timeEntries)}

## Rules
- Answer ONLY from the data above
- If data is insufficient, say "I don't have enough data to answer that"
- Be concise and specific
- Format numbers clearly (e.g., "8.5 hours", "3 team members")

Return JSON:
{
  "answer": "direct answer string",
  "data_points": ["key fact 1", "key fact 2"],
  "confidence": "HIGH|MEDIUM|LOW",
  "follow_up_suggestions": ["question1", "question2"]
}
`;
```

#### Prompt 4: Skill Gap Analysis
```javascript
const SKILL_GAP_PROMPT = (teamData, projectRequirements) => `
You are a technical resource planner. Analyze team skill gaps.

## Project Requirements
${JSON.stringify(projectRequirements)}

## Team Skills (from profiles)
${JSON.stringify(teamData.memberSkills)}

## Current Task Assignments
${JSON.stringify(teamData.taskAssignments)}

Return JSON:
{
  "coverage_score": 0-100,
  "well_covered_skills": ["skill"],
  "gaps": [{ "skill": "name", "severity": "CRITICAL|HIGH|MEDIUM", "impact": "description" }],
  "recommendations": [{ "type": "TRAINING|HIRE|REASSIGN", "detail": "string" }],
  "suggested_task_reassignments": [{ "task": "title", "current_assignee": "name", "suggested_assignee": "name", "reason": "string" }]
}
`;
```

### 7.3 ConvoKraft Chat Integration

```javascript
// ConvoKraft configuration
const CONVOKRAFT_CONFIG = {
  botName: 'Sync AI',
  welcomeMessage: 'Hi! I\'m Sync AI. Ask me anything about your projects, team, or delivery status.',
  intents: [
    {
      intent: 'project_status',
      examples: ['What is the status of project X?', 'How is project Y doing?'],
      handler: 'ai_service:project-health'
    },
    {
      intent: 'leave_balance',
      examples: ['What is my leave balance?', 'How many leaves do I have left?'],
      handler: 'people_service:leave-balance'
    },
    {
      intent: 'team_availability',
      examples: ['Who is on leave today?', 'Who is available this week?'],
      handler: 'people_service:attendance-live'
    },
    {
      intent: 'sprint_status',
      examples: ['What is the sprint status?', 'How are we doing in Sprint 3?'],
      handler: 'task_sprint_service:sprint-summary'
    },
    {
      intent: 'my_tasks',
      examples: ['What tasks do I have?', 'Show my pending work'],
      handler: 'task_sprint_service:my-tasks'
    },
    {
      intent: 'blockers',
      examples: ['What are the current blockers?', 'Any critical blockers?'],
      handler: 'delivery_sync_function:blockers'
    }
  ],
  fallback: 'POST /api/ai/query'  // Route unknown queries to NL query endpoint
};
```

### 7.4 QuickML Model Configurations

#### Model 1: Burnout Risk Classifier
```
Model Type: Text Classification (Zia AutoML)
Input features:
  - avg_daily_hours (DOUBLE)
  - mood_red_count (INTEGER) — red moods in 14 days
  - mood_green_count (INTEGER)
  - standup_compliance_rate (DOUBLE)
  - overdue_task_count (INTEGER)
  - leave_days_recent (DOUBLE)
  - blocker_raised_count (INTEGER)
  - eod_word_sentiment_score (DOUBLE) — from Zia Text Analytics
Output: LOW | MEDIUM | HIGH | CRITICAL
Training data: Historical EOD + mood data with labeled outcomes
```

#### Model 2: Sprint Completion Predictor
```
Model Type: Regression
Input features:
  - remaining_days (INTEGER)
  - completion_rate_current (DOUBLE)
  - historical_velocity_avg (DOUBLE)
  - blocked_tasks_count (INTEGER)
  - team_size (INTEGER)
  - scope_changes_count (INTEGER)
Output: predicted_completion_percentage (DOUBLE 0-100)
```

---

## 8. CRON JOB DESIGN

All cron jobs are Catalyst Cron jobs triggering serverless functions.

### Cron Job Registry

| # | Job Name | Schedule | Service | Action |
|---|---|---|---|---|
| 1 | standup_reminder | `0 9 * * 1-5` (9 AM Mon-Fri) | delivery_sync_function | Send standup reminders to all active team members without today's standup |
| 2 | eod_reminder | `0 17 * * 1-5` (5 PM Mon-Fri) | delivery_sync_function | Send EOD reminders to all active team members without today's EOD |
| 3 | blocker_escalation | `0 */6 * * *` (Every 6 hours) | delivery_sync_function | Escalate blockers open > 72 hours (existing, keep unchanged) |
| 4 | time_approval_reminder | `0 10 * * 2,4` (10 AM Tue & Thu) | time_tracking_service | Remind RMs of pending time approvals > 2 days old |
| 5 | leave_approval_reminder | `0 9 * * 1-5` (9 AM Mon-Fri) | people_service | Remind RMs of pending leave requests > 1 day old |
| 6 | attendance_anomaly | `30 9 * * 1-5` (9:30 AM Mon-Fri) | people_service | Detect users who haven't checked in (absent/no record) and flag anomaly |
| 7 | daily_ai_summary | `0 19 * * 1-5` (7 PM Mon-Fri) | ai_service | Generate daily delivery summary for all active projects |
| 8 | sprint_status_check | `0 8 * * *` (8 AM daily) | task_sprint_service | Flag sprints ending within 2 days, notify leads |
| 9 | asset_maintenance_check | `0 8 * * 1` (8 AM every Monday) | asset_service | Flag assets with maintenance due within 7 days |
| 10 | weekly_perf_score | `0 6 * * 1` (6 AM every Monday) | ai_service | Compute weekly performance scores for all users → Catalyst SQL |
| 11 | leave_balance_refresh | `0 1 1 1 *` (1 AM Jan 1 annually) | people_service | Refresh annual leave balances, carry forward eligible days |
| 12 | health_snapshot | `0 23 * * *` (11 PM daily) | reporting_service | Snapshot project health metrics to Catalyst SQL (project_health_snapshots) |

### Cron Job Implementation Template

```javascript
// Example: time_approval_reminder
// File: time_tracking_service/src/controllers/CronController.js

async function runTimeApprovalReminder(catalystApp) {
  const ds = new DataStoreService(catalystApp);

  // Find pending approvals older than 2 days
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - 2);

  const pendingApprovals = await ds.query(`
    SELECT tar.ROWID, tar.assigned_to, tar.requested_by, te.hours, te.date, te.project_id
    FROM time_approval_requests tar
    JOIN time_entries te ON tar.time_entry_id = te.ROWID
    WHERE tar.status = 'PENDING'
    AND tar.created_at < '${cutoffDate.toISOString()}'
  `);

  for (const approval of pendingApprovals) {
    await NotificationService.send(catalystApp, {
      tenantId: approval.tenant_id,
      userId: approval.assigned_to,
      type: 'TIME_APPROVAL_REMINDER',
      subject: 'Pending Time Approval Reminder',
      message: `You have a time entry pending approval from ${approval.requested_by_name}`,
      metadata: { approvalId: approval.ROWID }
    });

    await AuditService.log(catalystApp, {
      entityType: 'TIME_APPROVAL',
      entityId: approval.ROWID,
      action: 'REMINDER_SENT',
      performedBy: 'CRON_SYSTEM'
    });
  }
}
```

---

## 9. RBAC MODEL — EXTENDED

### 9.1 Complete Permission Set (54 permissions)

```javascript
// Constants.js — Extended PERMISSIONS object

const PERMISSIONS = {
  // ─── EXISTING (27) ─────────────────────────────────────────────────────────
  PROJECT_READ:        'PROJECT_READ',
  PROJECT_WRITE:       'PROJECT_WRITE',
  MILESTONE_READ:      'MILESTONE_READ',
  MILESTONE_WRITE:     'MILESTONE_WRITE',
  STANDUP_READ:        'STANDUP_READ',
  STANDUP_SUBMIT:      'STANDUP_SUBMIT',
  EOD_READ:            'EOD_READ',
  EOD_SUBMIT:          'EOD_SUBMIT',
  ACTION_READ:         'ACTION_READ',
  ACTION_WRITE:        'ACTION_WRITE',
  BLOCKER_READ:        'BLOCKER_READ',
  BLOCKER_WRITE:       'BLOCKER_WRITE',
  RAID_READ:           'RAID_READ',
  RAID_WRITE:          'RAID_WRITE',
  DECISION_READ:       'DECISION_READ',
  DECISION_WRITE:      'DECISION_WRITE',
  REPORT_READ:         'REPORT_READ',
  REPORT_WRITE:        'REPORT_WRITE',
  DASHBOARD_READ:      'DASHBOARD_READ',
  INVITE_USER:         'INVITE_USER',
  ADMIN_USERS:         'ADMIN_USERS',
  ADMIN_SETTINGS:      'ADMIN_SETTINGS',
  AI_READ:             'AI_READ',
  TEAM_READ:           'TEAM_READ',
  TEAM_WRITE:          'TEAM_WRITE',
  NOTIFICATION_READ:   'NOTIFICATION_READ',
  AUDIT_READ:          'AUDIT_READ',

  // ─── NEW — TASK & SPRINT (4) ───────────────────────────────────────────────
  TASK_READ:           'TASK_READ',
  TASK_WRITE:          'TASK_WRITE',
  TASK_COMMENT_WRITE:  'TASK_COMMENT_WRITE',
  SPRINT_READ:         'SPRINT_READ',
  SPRINT_WRITE:        'SPRINT_WRITE',

  // ─── NEW — TIME TRACKING (3) ──────────────────────────────────────────────
  TIME_READ:           'TIME_READ',
  TIME_WRITE:          'TIME_WRITE',
  TIME_APPROVE:        'TIME_APPROVE',

  // ─── NEW — ATTENDANCE (2) ─────────────────────────────────────────────────
  ATTENDANCE_READ:     'ATTENDANCE_READ',
  ATTENDANCE_WRITE:    'ATTENDANCE_WRITE',
  ATTENDANCE_ADMIN:    'ATTENDANCE_ADMIN',

  // ─── NEW — LEAVE (3) ──────────────────────────────────────────────────────
  LEAVE_READ:          'LEAVE_READ',
  LEAVE_WRITE:         'LEAVE_WRITE',
  LEAVE_APPROVE:       'LEAVE_APPROVE',
  LEAVE_ADMIN:         'LEAVE_ADMIN',

  // ─── NEW — ASSETS (3) ─────────────────────────────────────────────────────
  ASSET_READ:          'ASSET_READ',
  ASSET_WRITE:         'ASSET_WRITE',
  ASSET_ASSIGN:        'ASSET_ASSIGN',
  ASSET_APPROVE:       'ASSET_APPROVE',
  ASSET_ADMIN:         'ASSET_ADMIN',

  // ─── NEW — BADGES & PROFILE (3) ───────────────────────────────────────────
  BADGE_READ:          'BADGE_READ',
  BADGE_WRITE:         'BADGE_WRITE',
  BADGE_AWARD:         'BADGE_AWARD',
  PROFILE_READ:        'PROFILE_READ',
  PROFILE_WRITE:       'PROFILE_WRITE',

  // ─── NEW — ANNOUNCEMENTS (2) ──────────────────────────────────────────────
  ANNOUNCEMENT_READ:   'ANNOUNCEMENT_READ',
  ANNOUNCEMENT_WRITE:  'ANNOUNCEMENT_WRITE',

  // ─── NEW — ORG / CONFIG (3) ───────────────────────────────────────────────
  ORG_READ:            'ORG_READ',
  ORG_WRITE:           'ORG_WRITE',
  CONFIG_READ:         'CONFIG_READ',
  CONFIG_WRITE:        'CONFIG_WRITE',
};
```

### 9.2 Role → Permission Matrix

| Permission | TENANT_ADMIN | PMO | DELIVERY_LEAD | TEAM_MEMBER | EXEC | CLIENT |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| PROJECT_READ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| PROJECT_WRITE | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| TASK_READ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| TASK_WRITE | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| SPRINT_READ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| SPRINT_WRITE | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| TIME_READ | ✅ | ✅ | ✅ | own | ✅ | ❌ |
| TIME_WRITE | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| TIME_APPROVE | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| ATTENDANCE_READ | ✅ | ✅ | ✅ | own | ✅ | ❌ |
| ATTENDANCE_WRITE | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| ATTENDANCE_ADMIN | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| LEAVE_READ | ✅ | ✅ | ✅ | own | ✅ | ❌ |
| LEAVE_WRITE | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| LEAVE_APPROVE | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| LEAVE_ADMIN | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| ASSET_READ | ✅ | ✅ | ✅ | own | ✅ | ❌ |
| ASSET_WRITE | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| ASSET_ASSIGN | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| ASSET_APPROVE | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| BADGE_READ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| BADGE_WRITE | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| BADGE_AWARD | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| PROFILE_READ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| PROFILE_WRITE | ✅ | ✅ | ✅ | own | ❌ | ❌ |
| ANNOUNCEMENT_READ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| ANNOUNCEMENT_WRITE | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| ORG_READ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| ORG_WRITE | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| CONFIG_READ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| CONFIG_WRITE | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| AI_READ | ✅ | ✅ | ✅ | own | ✅ | ❌ |
| AUDIT_READ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |

> `own` = scoped to authenticated user's data only; enforced at query level.

### 9.3 Reporting Manager Dynamic Permission

Users with `reporting_manager_id` pointing to another user get dynamic `LEAVE_APPROVE`, `TIME_APPROVE` rights for their direct reports. This is resolved in `RBACMiddleware.js`:

```javascript
// Extended RBACMiddleware.js logic
async function resolveEffectivePermissions(userId, tenantId, catalystApp) {
  // 1. Get base role permissions
  const user = await getUser(userId, catalystApp);
  const basePermissions = ROLE_PERMISSIONS[user.role];

  // 2. Check permission_overrides table (tenant-level config)
  const override = await getPermissionOverride(tenantId, user.role, catalystApp);
  const effectivePermissions = override ? override.permissions : basePermissions;

  // 3. Check if user is a reporting manager (add approval rights)
  const directReportsCount = await countDirectReports(userId, tenantId, catalystApp);
  if (directReportsCount > 0) {
    effectivePermissions.push(PERMISSIONS.LEAVE_APPROVE, PERMISSIONS.TIME_APPROVE);
  }

  // 4. Check project-level overrides
  const projectPermissions = await getProjectPermissions(userId, tenantId, catalystApp);

  // 5. Cache in Catalyst Cache (10 min TTL)
  await cache.set(`permissions:${userId}`, JSON.stringify(effectivePermissions), 600);

  return [...new Set([...effectivePermissions, ...projectPermissions])];
}
```

---

## 10. STORAGE DESIGN — STRATUS

### 10.1 Folder Structure

```
stratus://{tenant_id}/
  ├── task_attachments/
  │   └── {task_id}/
  │       └── {timestamp}_{filename}
  ├── profiles/
  │   └── {user_id}/
  │       ├── photo.{ext}
  │       └── resume.pdf
  ├── badges/
  │   └── {badge_id}/
  │       └── logo.{ext}
  ├── assets/
  │   └── {asset_id}/
  │       ├── purchase_doc.pdf
  │       └── photo.{ext}
  ├── announcements/
  │   └── {announcement_id}/
  │       └── media.{ext}
  └── reports/
      └── exports/
          └── {job_id}/
              └── export.{csv|xlsx|pdf}
```

### 10.2 Upload Helper (shared across services)

```javascript
// shared/StratusService.js
class StratusService {
  constructor(catalystApp) {
    this.filestore = catalystApp.filestore();
  }

  async uploadFile(folder, fileName, buffer, mimeType) {
    const fileId = `${Date.now()}_${fileName}`;
    const folderInstance = this.filestore.folder(folder);
    await folderInstance.uploadFile({
      code: fileId,
      name: fileName,
      content: buffer,
      contentType: mimeType
    });
    // Return accessible URL
    return `${STRATUS_BASE_URL}/${folder}/${fileId}`;
  }

  async deleteFile(folder, fileCode) {
    const folderInstance = this.filestore.folder(folder);
    await folderInstance.deleteFile(fileCode);
  }

  async getSignedUrl(folder, fileCode, expirySeconds = 3600) {
    const folderInstance = this.filestore.folder(folder);
    return await folderInstance.getSignedUrl(fileCode, expirySeconds);
  }
}
```

---

## 11. ADMIN CONFIG SYSTEM — NO-CODE BUILDER

### 11.1 Workflow Builder Schema

```javascript
// Example: Custom task workflow config stored in workflow_configs
{
  "entity_type": "task",
  "name": "Engineering Workflow",
  "statuses": [
    { "id": "TODO",        "name": "To Do",       "color": "#6B7280", "position": 1, "is_terminal": false },
    { "id": "IN_PROGRESS", "name": "In Progress",  "color": "#3B82F6", "position": 2, "is_terminal": false },
    { "id": "IN_REVIEW",   "name": "In Review",    "color": "#F59E0B", "position": 3, "is_terminal": false },
    { "id": "TESTING",     "name": "Testing",      "color": "#8B5CF6", "position": 4, "is_terminal": false },
    { "id": "DONE",        "name": "Done",         "color": "#10B981", "position": 5, "is_terminal": true  },
    { "id": "CANCELLED",   "name": "Cancelled",    "color": "#EF4444", "position": 6, "is_terminal": true  }
  ],
  "transitions": [
    { "from": "TODO",        "to": "IN_PROGRESS", "requires_role": null,             "requires_comment": false },
    { "from": "IN_PROGRESS", "to": "IN_REVIEW",   "requires_role": null,             "requires_comment": false },
    { "from": "IN_REVIEW",   "to": "TESTING",     "requires_role": "DELIVERY_LEAD",  "requires_comment": false },
    { "from": "IN_REVIEW",   "to": "IN_PROGRESS", "requires_role": null,             "requires_comment": true  },
    { "from": "TESTING",     "to": "DONE",        "requires_role": "DELIVERY_LEAD",  "requires_comment": false },
    { "from": "TESTING",     "to": "IN_PROGRESS", "requires_role": null,             "requires_comment": true  },
    { "from": "*",           "to": "CANCELLED",   "requires_role": "DELIVERY_LEAD",  "requires_comment": true  }
  ]
}
```

### 11.2 Dynamic Form Config Schema

```javascript
// Example: Custom standup form with extra fields
{
  "form_type": "standup",
  "fields": [
    { "id": "yesterday",   "label": "What did you do yesterday?", "type": "textarea", "required": true,  "order": 1 },
    { "id": "today",       "label": "What are you doing today?",  "type": "textarea", "required": true,  "order": 2 },
    { "id": "blockers",    "label": "Any blockers?",              "type": "textarea", "required": false, "order": 3 },
    { "id": "confidence",  "label": "Sprint confidence (1-10)",   "type": "number",   "required": false, "order": 4, "min": 1, "max": 10 },
    { "id": "focus_area",  "label": "Primary focus today",        "type": "select",   "required": false, "order": 5,
      "options": ["Feature Dev", "Bug Fix", "Code Review", "Documentation", "Meeting", "Other"] }
  ]
}
```

---

## 12. DATA MIGRATION STRATEGY

### 12.1 Migration Architecture

```
SOURCE SYSTEM (e.g., Jira/Linear/Zoho Projects/Asana/Monday.com)
  │
  ├── Step 1: EXTRACT
  │   └── Export CSV/Excel/JSON from source
  │       ├── Users & roles
  │       ├── Projects
  │       ├── Tasks/Issues
  │       ├── Time logs
  │       └── Historical data
  │
  ├── Step 2: TRANSFORM
  │   └── Migration script (Node.js) maps to Delivery Sync schema
  │       ├── Map source statuses → DS workflow statuses
  │       ├── Map user IDs → DS user IDs
  │       ├── Normalize dates → ISO 8601
  │       └── Generate tenant_id for all rows
  │
  ├── Step 3: VALIDATE
  │   └── POST /api/config/migration/validate
  │       ├── Schema validation (Joi)
  │       ├── Duplicate detection
  │       ├── Referential integrity check
  │       └── Returns validation report
  │
  └── Step 4: IMPORT
      └── POST /api/config/migration/import
          ├── Batch size: 500 rows per request
          ├── Transactional per batch (rollback on error)
          ├── Idempotent (upsert by external_id)
          └── Returns job_id for status polling
```

### 12.2 Migration Endpoint

```javascript
// admin_config_service/src/controllers/MigrationController.js

async function importData(req, res) {
  const { entity_type, data, source_system, external_id_field } = req.body;

  // Validate
  const schema = MIGRATION_SCHEMAS[entity_type];
  const { valid, errors } = validateBatch(data, schema);
  if (!valid) return ResponseHelper.validationError(res, errors);

  // Dedup check
  const externalIds = data.map(row => row[external_id_field]);
  const existing = await checkExistingByExternalIds(externalIds, entity_type, req.tenantId);

  // Insert batch
  const results = { inserted: 0, updated: 0, skipped: 0, errors: [] };
  for (const row of data) {
    try {
      const mapped = FIELD_MAPPERS[entity_type](row, req.tenantId);
      if (existing.has(row[external_id_field])) {
        await ds.update(TABLE_MAP[entity_type], existing.get(row[external_id_field]), mapped);
        results.updated++;
      } else {
        await ds.insert(TABLE_MAP[entity_type], { ...mapped, external_id: row[external_id_field], source_system });
        results.inserted++;
      }
    } catch (err) {
      results.errors.push({ row: row[external_id_field], error: err.message });
    }
  }

  await AuditService.log(catalystApp, {
    entityType: entity_type,
    action: 'BULK_IMPORT',
    newValue: results,
    performedBy: req.currentUser.id
  });

  return ResponseHelper.success(res, results);
}
```

### 12.3 Migration Field Maps

#### Jira → Delivery Sync Tasks
```javascript
const JIRA_TASK_MAPPER = (jiraIssue, tenantId) => ({
  tenant_id: tenantId,
  title: jiraIssue.summary,
  description: jiraIssue.description,
  type: JIRA_TYPE_MAP[jiraIssue.issuetype?.name] || 'TASK',
  status: JIRA_STATUS_MAP[jiraIssue.status?.name] || 'TODO',
  priority: JIRA_PRIORITY_MAP[jiraIssue.priority?.name] || 'MEDIUM',
  story_points: jiraIssue.storyPoints || null,
  due_date: jiraIssue.duedate || null,
  created_at: jiraIssue.created,
  updated_at: jiraIssue.updated
});

const JIRA_TYPE_MAP = {
  'Story': 'STORY', 'Bug': 'BUG', 'Task': 'TASK',
  'Sub-task': 'SUBTASK', 'Epic': 'EPIC'
};

const JIRA_STATUS_MAP = {
  'To Do': 'TODO', 'In Progress': 'IN_PROGRESS',
  'In Review': 'IN_REVIEW', 'Done': 'DONE', 'Closed': 'DONE'
};
```

#### Zoho People → Delivery Sync Leave
```javascript
const ZOHO_PEOPLE_LEAVE_MAPPER = (leaveRecord, tenantId) => ({
  tenant_id: tenantId,
  days_count: leaveRecord.Total_Days,
  start_date: leaveRecord.From_Date,
  end_date: leaveRecord.To_Date,
  reason: leaveRecord.Reason,
  status: LEAVE_STATUS_MAP[leaveRecord.ApprovalStatus]
});
```

### 12.4 Migration Checklist

```
PRE-MIGRATION
  □ Export all source data
  □ Invite all users to Delivery Sync (pre-create user records)
  □ Create projects with matching names
  □ Configure leave types to match source
  □ Configure workflow statuses to match source

MIGRATION ORDER (dependency-aware)
  1. tenants (already exist)
  2. users (invite flow)
  3. user_profiles
  4. projects
  5. project_members
  6. milestones
  7. sprints
  8. tasks (after projects + sprints)
  9. task_attachments (after tasks)
  10. time_entries (after tasks)
  11. leave_types
  12. leave_balances
  13. leave_requests
  14. attendance_records
  15. asset_categories
  16. assets
  17. badge_definitions
  18. standup_entries (after projects + users)
  19. eod_entries (after projects + users)
  20. actions (after projects + users)
  21. blockers (after projects + users)
  22. decisions (after projects + users)

POST-MIGRATION
  □ Verify record counts match source
  □ Spot-check 10% of records manually
  □ Verify user logins work
  □ Check AI insights generate correctly
  □ Run leave balance reconciliation report
  □ Verify audit logs populated correctly
```

---

## 13. FRONTEND EXTENSION PLAN

### 13.1 New Pages to Add

```
src/pages/
  ├── SprintsPage.tsx              — Sprint list + create
  ├── SprintBoardPage.tsx          — Kanban drag-drop board
  ├── SprintBacklogPage.tsx        — Backlog management
  ├── TaskDetailPage.tsx           — Task detail with comments + attachments
  ├── TimeTrackingPage.tsx         — Time entry log + timer
  ├── TimeApprovalPage.tsx         — RM approval queue
  ├── AttendancePage.tsx           — Check-in/out + team view
  ├── LeavePage.tsx                — Leave application + calendar
  ├── LeaveAdminPage.tsx           — Leave type config + approval management
  ├── AnnouncementsPage.tsx        — Announcement feed
  ├── AssetInventoryPage.tsx       — Asset list + request
  ├── AssetRequestPage.tsx         — Request form
  ├── BadgesPage.tsx               — Badge library + award
  ├── ProfilePage.tsx              — Enhanced (existing) + badges + skills
  ├── TeamDirectoryPage.tsx        — Team member cards with profiles
  ├── WorkflowBuilderPage.tsx      — No-code workflow editor
  ├── FormBuilderPage.tsx          — No-code form editor
  ├── FeatureFlagsPage.tsx         — Admin feature toggles
  ├── OrgHierarchyPage.tsx         — Interactive org tree
  ├── ChatPage.tsx                 — ConvoKraft embedded interface
  └── MigrationPage.tsx            — Data import wizard
```

### 13.2 New Hooks to Add

```
src/hooks/
  ├── useSprints.ts
  ├── useTasks.ts
  ├── useKanbanBoard.ts
  ├── useTimeEntries.ts
  ├── useTimeApprovals.ts
  ├── useAttendance.ts
  ├── useLeave.ts
  ├── useAnnouncements.ts
  ├── useAssets.ts
  ├── useBadges.ts
  ├── useUserProfile.ts
  ├── useOrgHierarchy.ts
  ├── useWorkflowConfig.ts
  ├── useFeatureFlags.ts
  └── useMigration.ts
```

---

## 14. NOTIFICATION SYSTEM EXTENSION

### 14.1 Complete Notification Type Registry (40 types)

```javascript
// Extended Constants.js — NOTIFICATION_TYPES

const NOTIFICATION_TYPES = {
  // ─── EXISTING (11) ────────────────────────────────────────────────────────
  STANDUP_REMINDER:        'STANDUP_REMINDER',
  EOD_REMINDER:            'EOD_REMINDER',
  BLOCKER_ADDED:           'BLOCKER_ADDED',
  BLOCKER_ESCALATED:       'BLOCKER_ESCALATED',
  BLOCKER_RESOLVED:        'BLOCKER_RESOLVED',
  PROJECT_ASSIGNED:        'PROJECT_ASSIGNED',
  ACTION_ASSIGNED:         'ACTION_ASSIGNED',
  ACTION_OVERDUE:          'ACTION_OVERDUE',
  REPORT_READY:            'REPORT_READY',
  TEAM_UPDATED:            'TEAM_UPDATED',
  SYSTEM_ANNOUNCEMENT:     'SYSTEM_ANNOUNCEMENT',

  // ─── TASK & SPRINT (8) ────────────────────────────────────────────────────
  TASK_ASSIGNED:           'TASK_ASSIGNED',
  TASK_STATUS_CHANGED:     'TASK_STATUS_CHANGED',
  TASK_COMMENT_ADDED:      'TASK_COMMENT_ADDED',
  TASK_DUE_SOON:           'TASK_DUE_SOON',
  TASK_OVERDUE:            'TASK_OVERDUE',
  SPRINT_STARTED:          'SPRINT_STARTED',
  SPRINT_ENDING_SOON:      'SPRINT_ENDING_SOON',
  SPRINT_COMPLETED:        'SPRINT_COMPLETED',

  // ─── TIME TRACKING (4) ────────────────────────────────────────────────────
  TIME_APPROVAL_NEEDED:    'TIME_APPROVAL_NEEDED',
  TIME_APPROVAL_REMINDER:  'TIME_APPROVAL_REMINDER',
  TIME_ENTRY_APPROVED:     'TIME_ENTRY_APPROVED',
  TIME_ENTRY_REJECTED:     'TIME_ENTRY_REJECTED',

  // ─── LEAVE (4) ────────────────────────────────────────────────────────────
  LEAVE_APPROVAL_NEEDED:   'LEAVE_APPROVAL_NEEDED',
  LEAVE_APPROVAL_REMINDER: 'LEAVE_APPROVAL_REMINDER',
  LEAVE_APPROVED:          'LEAVE_APPROVED',
  LEAVE_REJECTED:          'LEAVE_REJECTED',

  // ─── ATTENDANCE (2) ───────────────────────────────────────────────────────
  ATTENDANCE_ANOMALY:      'ATTENDANCE_ANOMALY',
  ATTENDANCE_LATE:         'ATTENDANCE_LATE',

  // ─── ASSETS (4) ───────────────────────────────────────────────────────────
  ASSET_REQUEST_RAISED:    'ASSET_REQUEST_RAISED',
  ASSET_REQUEST_APPROVED:  'ASSET_REQUEST_APPROVED',
  ASSET_REQUEST_REJECTED:  'ASSET_REQUEST_REJECTED',
  ASSET_ASSIGNED:          'ASSET_ASSIGNED',
  ASSET_MAINTENANCE_DUE:   'ASSET_MAINTENANCE_DUE',

  // ─── BADGES (2) ───────────────────────────────────────────────────────────
  BADGE_AWARDED:           'BADGE_AWARDED',
  BADGE_REVOKED:           'BADGE_REVOKED',

  // ─── ANNOUNCEMENTS (1) ────────────────────────────────────────────────────
  ANNOUNCEMENT_PUBLISHED:  'ANNOUNCEMENT_PUBLISHED',

  // ─── AI (2) ───────────────────────────────────────────────────────────────
  AI_SUMMARY_READY:        'AI_SUMMARY_READY',
  BURNOUT_ALERT:           'BURNOUT_ALERT',
};
```

---

## 15. INTEGRATION MAP

### 15.1 Module → Catalyst Services Matrix

| Module | DataStore | Cache | Signals | Cron | Stratus | QuickML | ConvoKraft | SmartBrowz | SQL | Zia |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| Core (existing) | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Task & Sprint | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ❌ |
| Time Tracking | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| People | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ❌ |
| Assets | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ |
| Badges & Profile | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Admin Config | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Reporting | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | ❌ |
| AI Engine | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | ❌ | ✅ | ✅ |

### 15.2 Summary Metrics

| Metric | Existing | Extended | Total |
|---|---|---|---|
| Serverless Functions | 2 | 7 | **9** |
| DataStore Tables | 19 | 41 | **60** |
| Catalyst SQL Tables | 0 | 5 | **5** |
| API Endpoints | ~55 | ~170 | **~225** |
| Cron Jobs | 3 | 9 | **12** |
| Signal Event Types | 0 | 17 | **17** |
| Notification Types | 11 | 29 | **40** |
| RBAC Permissions | 27 | 27 | **54** |
| Stratus Folders | 0 | 7 | **7** |
| AI Endpoints | 10 | 9 | **19** |
| Frontend Pages | 22 | 21 | **43** |

---

## IMPLEMENTATION SEQUENCE (Recommended)

```
Phase 1 — Foundation (Week 1-2)
  ✅ Create all 41 new DataStore tables
  ✅ Create Catalyst SQL tables
  ✅ Scaffold 7 new serverless functions with shared libs
  ✅ Set up Signals event registry
  ✅ Extend Constants.js (permissions, notification types)

Phase 2 — Core New Services (Week 3-5)
  ✅ task_sprint_service (Tasks + Sprints + Kanban)
  ✅ time_tracking_service (Time entries + Approvals)
  ✅ badge_profile_service (Profiles + Badges)

Phase 3 — People & Assets (Week 6-8)
  ✅ people_service (Attendance + Leave + Announcements)
  ✅ asset_service (Inventory + Requests + Lifecycle)

Phase 4 — Intelligence Layer (Week 9-10)
  ✅ Extended AI endpoints (Burnout, Sprint prediction, Skill gap)
  ✅ ConvoKraft chat integration
  ✅ Auto-badge award via AI

Phase 5 — Config & Reporting (Week 11-12)
  ✅ admin_config_service (Workflow builder, Form builder, Feature flags)
  ✅ reporting_service (Cross-service reports, PDF via SmartBrowz)

Phase 6 — Migration & Go-Live (Week 13-14)
  ✅ Migration endpoints + field mappers
  ✅ Full data migration from source systems
  ✅ Frontend extension (new pages + hooks)
  ✅ End-to-end QA + performance testing
```

---

*Delivery Sync Enterprise Architecture v2.0 — Extending an existing platform, not rewriting it.*
