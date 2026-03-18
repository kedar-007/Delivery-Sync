# Delivery Sync — Notification System

All notifications fire on **two channels simultaneously**:
- **In-App Bell** — stored in the `notifications` table, shown in the header bell icon
- **Email** — sent via Catalyst Mail API using HTML templates

Outcomes (sent / failed / skipped) are recorded in the `audit_logs` table under `entity_type = 'notification'`.

---

## Notification Events

### 1. Action Assigned
| Field | Value |
|---|---|
| **Trigger** | A new action is created (`POST /api/actions`) |
| **Recipient** | The user the action is assigned to (`owner_user_id`) |
| **Skip condition** | Creator is assigning to themselves |
| **Email subject** | `[Delivery Sync] New action assigned – {actionTitle}` |
| **Email content** | Action title, project, due date, assigned by |
| **Audit reason codes** | `ok` / `no_email_on_user` / `assigning_to_self` / `send_failed` |

---

### 2. Action Reassigned
| Field | Value |
|---|---|
| **Trigger** | An action's `owner_user_id` is changed via `PUT /api/actions/:id` |
| **Recipient** | The newly assigned user |
| **Skip condition** | Updater is reassigning to themselves |
| **Email subject** | `[Delivery Sync] New action assigned – {actionTitle}` |
| **Email content** | Action title, project, due date, assigned by |

---

### 3. Action Status Changed
| Field | Value |
|---|---|
| **Trigger** | Action `status` changes via `PUT /api/actions/:id` |
| **Recipient** | The action owner (`assigned_to`) |
| **Skip condition** | Owner themselves changed the status |
| **Email subject** | `[Delivery Sync] Action status updated – {actionTitle}` |
| **Email content** | Action title, project, new status (colour-coded), due date, changed by. Special message for DONE (congratulations) and ON_HOLD (check with lead) |
| **Statuses notified** | OPEN, IN_PROGRESS, DONE, ON_HOLD, CANCELLED |

---

### 4. Action Overdue *(Scheduled)*
| Field | Value |
|---|---|
| **Trigger** | Catalyst Cron job — runs daily (e.g. 09:00) |
| **Recipient** | Each action owner whose action is past due date and still open |
| **Deduplication** | Skipped if already notified today (checked via `notifications` table) |
| **Email subject** | `[Delivery Sync] Overdue action – {actionTitle}` |
| **Email content** | Action title, project, due date, red OVERDUE status |

---

### 5. Blocker Raised
| Field | Value |
|---|---|
| **Trigger** | A new blocker is created (`POST /api/blockers`) |
| **Recipients** | All project members with leadership roles: `DELIVERY_LEAD`, `PROJECT_MANAGER`, `TECH_LEAD`, `SCRUM_MASTER`, `PRODUCT_OWNER`, `LEAD` |
| **Skip condition** | Lead is the same person who raised the blocker |
| **Email subject** | `[Delivery Sync] {SEVERITY} blocker raised – {projectName}` |
| **Email content** | Blocker title, project, severity (colour-coded), raised by. Red warning banner for CRITICAL/HIGH |

---

### 6. Blocker Resolved
| Field | Value |
|---|---|
| **Trigger** | `PATCH /api/blockers/:id/resolve` OR `PUT /api/blockers/:id` with status → `RESOLVED` |
| **Recipient** | The user who originally raised the blocker (`raised_by`) |
| **Email subject** | `[Delivery Sync] Blocker resolved – {blockerTitle}` |
| **Email content** | Blocker title, project, resolved by, resolution note (green highlight box) |

---

### 7. Blocker Escalated *(Scheduled)*
| Field | Value |
|---|---|
| **Trigger** | Catalyst Cron job — runs daily, checks blockers open longer than the escalation threshold |
| **Recipients** | Project leads (same roles as Blocker Raised) |
| **Email subject** | `[Delivery Sync] CRITICAL blocker escalation – {projectName}` |
| **Email content** | Blocker title, severity, project, number of days open |

---

### 8. Added to Project
| Field | Value |
|---|---|
| **Trigger** | A user is added to a project (`POST /api/projects/:id/members`) |
| **Recipient** | The newly added user |
| **Skip condition** | User is adding themselves |
| **Email subject** | `[Delivery Sync] You've been added to {projectName}` |
| **Email content** | Project name, assigned role, added by |

---

### 9. Added to Team
| Field | Value |
|---|---|
| **Trigger** | A user is added to a team (`POST /api/teams/:id/members`) |
| **Recipient** | The newly added user |
| **Skip condition** | User is adding themselves |
| **Email subject** | `[Delivery Sync] You've been added to team "{teamName}"` |
| **Email content** | Team name, project, team role, added by |

---

### 10. Standup Reminder *(Scheduled)*
| Field | Value |
|---|---|
| **Trigger** | Catalyst Cron job — runs at standup time (e.g. 09:00) on weekdays |
| **Recipients** | All project members who have **not** submitted a standup for today |
| **Deduplication** | Skipped if already notified today |
| **Email subject** | `[Delivery Sync] Standup reminder – {projectName}` |
| **Email content** | Project name, date, reminder to submit standup |

---

### 11. EOD Reminder *(Scheduled)*
| Field | Value |
|---|---|
| **Trigger** | Catalyst Cron job — runs at EOD time (e.g. 16:30) on weekdays |
| **Recipients** | All project members who have **not** submitted an EOD update for today |
| **Deduplication** | Skipped if already notified today |
| **Email subject** | `[Delivery Sync] EOD update reminder – {projectName}` |
| **Email content** | Project name, date, reminder to submit EOD update |

---

### 12. Daily Summary *(Scheduled)*
| Field | Value |
|---|---|
| **Trigger** | Catalyst Cron job — runs end of day |
| **Recipients** | Project leads (`DELIVERY_LEAD`, `PROJECT_MANAGER`) |
| **Email subject** | `[Delivery Sync] Daily Summary – {projectName} – {date}` |
| **Email content** | List of who submitted standup/EOD and who missed, project health overview |

---

## Notification Channels

### In-App Bell
- Stored in `notifications` table
- Columns: `tenant_id`, `user_id`, `title`, `message`, `type`, `is_read`, `entity_type`, `entity_id`, `metadata`
- Read via `GET /api/notifications`
- Mark read via `PATCH /api/notifications/:id/read`

### Email
- Sent via `catalystApp.email().sendMail()`
- Sender: configured in `FROM_EMAIL` environment variable (e.g. `catalystadmin@dsv360.ai`)
- Sender must be verified in **Catalyst Console → Messaging → Email → From Address**
- Format: `html_mode: true`, `to_email: [array]`
- All templates use a shared base layout with a coloured header, info card table, optional CTA button, and footer

---

## Audit Trail

Every notification attempt is logged to `audit_logs` with:

| `entity_type` | `entity_id` | `action` | `new_value` |
|---|---|---|---|
| `notification` | ID of the related entity | `NOTIFY_SENT` | `{ channel, event, toEmail, toName, reason: "ok" }` |
| `notification` | ID of the related entity | `NOTIFY_FAILED` | `{ reason: "send_failed", toEmail }` |
| `notification` | ID of the related entity | `NOTIFY_SKIPPED` | `{ reason: "no_email_on_user" / "assigning_to_self" / "no_leads_found_in_project_members" }` |

---

## Setup Checklist

- [ ] Verify sender email in **Catalyst Console → Messaging → Email → From Address**
- [ ] Set `FROM_EMAIL` environment variable in Catalyst function config
- [ ] Ensure `notifications` table exists with all required columns
- [ ] Ensure `audit_logs` table exists with all required columns
- [ ] Configure Catalyst Cron jobs for: standup reminder, EOD reminder, action overdue check, blocker escalation, daily summary
- [ ] Confirm team `standup_time`, `eod_time`, `timezone` columns exist in the `teams` table
