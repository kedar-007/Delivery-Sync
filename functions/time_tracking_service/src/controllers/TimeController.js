'use strict';

const DataStoreService    = require('../services/DataStoreService');
const AuditService        = require('../services/AuditService');
const NotificationService = require('../services/NotificationService');
const TeamScopeService    = require('../services/TeamScopeService');
const ResponseHelper      = require('../utils/ResponseHelper');
const { TABLES, PERMISSIONS, TIME_STATUS, AUDIT_ACTION, NOTIFICATION_TYPE } = require('../utils/Constants');

class TimeController {
  constructor(catalystApp) {
    this.db    = new DataStoreService(catalystApp);
    this.audit = new AuditService(this.db);
    this.notif = new NotificationService(catalystApp, this.db);
  }

  // GET /api/time/entries?project_id=&user_id=&date_from=&date_to=&status=&is_billable=&page=&pageSize=
  //
  // Pagination is OPT-IN: pass `page` in the query string to get back a
  // wrapped envelope `{ entries, pagination }`. Without `page` the response
  // stays a plain array (legacy callers — analytics tab, summary aggregation
  // — keep working without changes). Pass `user_ids` (comma-separated) to scope
  // the list to a set of members — used by the org tab's Team filter so it
  // paginates server-side instead of capping client-side.
  async list(req, res) {
    const { project_id, task_id, user_id, user_ids, date_from, date_to, status, is_billable } = req.query;
    const tenantId = req.tenantId;
    const me = req.currentUser;

    // Pagination params — only kick in when the caller passes `page`.
    const paginated = req.query.page !== undefined;
    const page      = Math.max(1,   parseInt(req.query.page,     10) || 1);
    const pageSize  = Math.min(200, Math.max(1, parseInt(req.query.pageSize, 10) || 50));
    const offset    = (page - 1) * pageSize;

    let where = '';
    // Visibility ladder (most permissive first):
    //   1. Admin roles / ORG_WIDE scope → see all entries in the tenant
    //   2. TIME_TEAM_VIEW or team lead  → see team peers' entries only
    //   3. (fallback)                   → own entries only
    const MANAGER_ROLES = ['TENANT_ADMIN', 'PMO', 'DELIVERY_LEAD'];
    const userPerms   = Array.isArray(me.permissions) ? me.permissions : [];
    const canSeeAll = MANAGER_ROLES.includes(me.role)
      || me.dataScope === 'ORG_WIDE'
      || me.dataScope === 'SUBORDINATES'
      || userPerms.includes('PROJECT_DATA_VIEW_ALL');
    const hasTeamView = userPerms.includes(PERMISSIONS.TIME_TEAM_VIEW);
    const callerUid   = String(me.id);

    // The requested member filter: a single user_id, or a comma-separated
    // user_ids list (org Team filter). Always intersected with what the caller
    // is allowed to see below.
    const requested = user_id
      ? [String(user_id)]
      : (user_ids ? String(user_ids).split(',').map((s) => s.trim()).filter(Boolean) : null);
    const addUserClause = (ids) => {
      if (ids.length === 1) {
        where += `user_id = '${DataStoreService.escape(ids[0])}' AND `;
      } else {
        const inList = ids.map((id) => `'${DataStoreService.escape(id)}'`).join(',');
        where += `user_id IN (${inList}) AND `;
      }
    };

    if (canSeeAll) {
      if (requested && requested.length) addUserClause(requested);
    } else if (hasTeamView || await this._isTeamLead(tenantId, callerUid)) {
      const scope = new TeamScopeService(this.db);
      const peerIds = (await scope.getTeamPeerUserIds(tenantId, callerUid)).map(String);
      let allowed = peerIds;
      if (requested && requested.length) {
        allowed = peerIds.filter((id) => requested.includes(id));
        if (allowed.length === 0) {
          // The requested member(s) fall outside the caller's team scope.
          const empty = paginated ? { entries: [], pagination: { page: 1, pageSize, total: 0, totalPages: 1, hasMore: false } } : [];
          return ResponseHelper.success(res, empty);
        }
      }
      if (allowed.length === 0) {
        where += `user_id = '${DataStoreService.escape(callerUid)}' AND `;
      } else {
        addUserClause(allowed);
      }
    } else {
      where += `user_id = '${DataStoreService.escape(callerUid)}' AND `;
    }
    if (project_id) where += `project_id = '${DataStoreService.escape(project_id)}' AND `;
    if (task_id)    where += `task_id = '${DataStoreService.escape(task_id)}' AND `;
    if (status)     where += `status = '${DataStoreService.escape(status)}' AND `;
    if (is_billable !== undefined) where += `is_billable = '${is_billable === 'true' ? 'true' : 'false'}' AND `;
    if (date_from)  where += `entry_date >= '${DataStoreService.escape(date_from)}' AND `;
    if (date_to)    where += `entry_date <= '${DataStoreService.escape(date_to)}' AND `;
    where = where.replace(/ AND $/, '');

    // Fetch the slice + (only when paginated) a parallel COUNT for totals.
    // The COUNT query reuses the same WHERE clause so totals stay in sync.
    const tenantClause = `tenant_id = '${DataStoreService.escape(String(tenantId))}'`;
    const fullWhere    = where ? `${tenantClause} AND ${where}` : tenantClause;

    const [entries, countRows] = await Promise.all([
      this.db.findWhere(TABLES.TIME_ENTRIES, tenantId, where, {
        // Primary sort: the date the work was done (descending).
        // Tiebreaker: CREATEDTIME DESC so a freshly-logged entry on the same
        // date jumps to the top of its day instead of appearing in arbitrary
        // SDK order. ZCQL accepts comma-separated ORDER BY columns.
        orderBy: 'entry_date DESC, CREATEDTIME DESC',
        limit:   paginated ? pageSize : 200,
        offset:  paginated ? offset   : undefined,
      }),
      paginated
        ? this.db.query(`SELECT COUNT(ROWID) FROM ${TABLES.TIME_ENTRIES} WHERE ${fullWhere}`)
        : Promise.resolve(null),
    ]);

    // Enrich with user / project / task name. Fetch only the IDs referenced
    // by THIS page of entries — same N+1-free pattern as before. Filter BEFORE
    // String() so null doesn't become the literal string 'null' (would break
    // the ROWID IN clause as BIGINT).
    const _isValidId = (id) => id != null && id !== '' && id !== 'null' && id !== 'undefined';
    const userIds = [...new Set(entries.map((e) => e.user_id).filter(_isValidId).map(String))];
    const projIds = [...new Set(entries.map((e) => e.project_id).filter(_isValidId).map(String))];
    const taskIds = [...new Set(entries.map((e) => e.task_id).filter(_isValidId).map(String))];
    const userMap = {};
    const projMap = {};
    const taskMap = {};
    const fetches = [];
    if (userIds.length > 0) {
      const inList = userIds.map((id) => `'${DataStoreService.escape(id)}'`).join(',');
      fetches.push(
        this.db.query(`SELECT ROWID, name, avatar_url FROM ${TABLES.USERS} WHERE ROWID IN (${inList})`)
          .then((rows) => rows.forEach((u) => { userMap[String(u.ROWID)] = u; }))
      );
    }
    if (projIds.length > 0) {
      const inList = projIds.map((id) => `'${DataStoreService.escape(id)}'`).join(',');
      fetches.push(
        this.db.query(`SELECT ROWID, name FROM ${TABLES.PROJECTS} WHERE ROWID IN (${inList})`)
          .then((rows) => rows.forEach((p) => { projMap[String(p.ROWID)] = p.name || ''; }))
      );
    }
    if (taskIds.length > 0) {
      const inList = taskIds.map((id) => `'${DataStoreService.escape(id)}'`).join(',');
      fetches.push(
        this.db.query(`SELECT ROWID, title FROM ${TABLES.TASKS} WHERE ROWID IN (${inList})`)
          .then((rows) => rows.forEach((t) => { taskMap[String(t.ROWID)] = t.title || ''; }))
      );
    }
    await Promise.all(fetches);

    const enriched = entries.map(e => {
      const u = userMap[String(e.user_id)] || {};
      return {
        ...e,
        user_name:    u.name || '',
        user_avatar_url: u.avatar_url || '',
        project_name: projMap[String(e.project_id)] || '',
        task_name:    taskMap[String(e.task_id)] || '',
      };
    });

    if (paginated) {
      // ZCQL returns COUNT under an unpredictable column name (the alias
      // isn't always preserved). Grab the first value of the first row
      // regardless of column name — same pattern delivery_sync_function uses.
      let total = 0;
      if (Array.isArray(countRows) && countRows.length > 0) {
        const firstVal = Object.values(countRows[0])[0];
        total = parseInt(String(firstVal), 10) || 0;
      }
      const totalPages = Math.max(1, Math.ceil(total / pageSize));
      return ResponseHelper.success(res, {
        entries: enriched,
        pagination: {
          page,
          pageSize,
          total,
          totalPages,
          hasMore: page < totalPages,
        },
      });
    }
    return ResponseHelper.success(res, enriched);
  }

  // GET /api/time/entries/my-week
  async myWeek(req, res) {
    // Use IST (UTC+5:30) for week boundaries so the week aligns with the user's calendar day
    const istNow  = new Date(Date.now() + 5.5 * 3600000);
    const dayOfWk = istNow.getUTCDay(); // 0=Sun … 6=Sat
    const diffToMon = (dayOfWk === 0 ? -6 : 1 - dayOfWk); // offset to Monday
    const mon     = new Date(istNow); mon.setUTCDate(istNow.getUTCDate() + diffToMon);
    const sun     = new Date(mon);    sun.setUTCDate(mon.getUTCDate() + 6);
    const from    = mon.toISOString().split('T')[0];
    const to      = sun.toISOString().split('T')[0];
    // queryAll pages past the 300-row cap so a heavy week never truncates the
    // totals (findWhere's 100-row limit silently under-counted busy weeks).
    const entries = await this.db.queryAll(
      `SELECT * FROM ${TABLES.TIME_ENTRIES} WHERE tenant_id = '${DataStoreService.escape(String(req.tenantId))}'`
      + ` AND user_id = '${DataStoreService.escape(String(req.currentUser.id))}'`
      + ` AND entry_date >= '${DataStoreService.escape(from)}' AND entry_date <= '${DataStoreService.escape(to)}'`
      + ` ORDER BY entry_date ASC`);

    // Enrich entries with project name — fetch only referenced projects.
    // Filter BEFORE String() so null / undefined don't become 'null' / 'undefined'.
    const _isValidId = (id) => id != null && id !== '' && id !== 'null' && id !== 'undefined';
    const projIds = [...new Set(entries.map((e) => e.project_id).filter(_isValidId).map(String))];
    const projMap = {};
    if (projIds.length > 0) {
      const inList = projIds.map((id) => `'${DataStoreService.escape(id)}'`).join(',');
      const projects = await this.db.query(
        `SELECT ROWID, name FROM ${TABLES.PROJECTS} WHERE ROWID IN (${inList})`
      );
      projects.forEach(p => { projMap[String(p.ROWID)] = p.name || ''; });
    }
    const enrichedEntries = entries.map(e => ({ ...e, project_name: projMap[String(e.project_id)] || '' }));

    const total   = entries.reduce((s, e) => s + (parseFloat(e.hours) || 0), 0);
    // Catalyst returns is_billable as boolean true OR string 'true' depending on
    // the column type — normalise before comparing or billable_hours reads 0.
    const billable = entries
      .filter(e => String(e.is_billable).toLowerCase() === 'true')
      .reduce((s, e) => s + (parseFloat(e.hours) || 0), 0);
    return ResponseHelper.success(res, { entries: enrichedEntries, total_hours: total, billable_hours: billable, week_start: from, week_end: to });
  }

  // GET /api/time/entries/summary
  async summary(req, res) {
    const { project_id, date_from, date_to } = req.query;
    const tenantId = req.tenantId;
    let where = '';
    if (project_id) where += `project_id = '${DataStoreService.escape(project_id)}' AND `;
    if (date_from)  where += `entry_date >= '${DataStoreService.escape(date_from)}' AND `;
    if (date_to)    where += `entry_date <= '${DataStoreService.escape(date_to)}' AND `;
    where = where.replace(/ AND $/, '');

    const entries = await this.db.findWhere(TABLES.TIME_ENTRIES, tenantId, where, { limit: 200 });

    // Aggregate per user
    const byUser = {};
    for (const e of entries) {
      if (!byUser[e.user_id]) byUser[e.user_id] = { user_id: e.user_id, total: 0, billable: 0, entries: 0 };
      byUser[e.user_id].total    += parseFloat(e.hours) || 0;
      byUser[e.user_id].billable += (String(e.is_billable).toLowerCase() === 'true') ? (parseFloat(e.hours) || 0) : 0;
      byUser[e.user_id].entries  += 1;
    }

    return ResponseHelper.success(res, { by_user: Object.values(byUser), total_hours: entries.reduce((s, e) => s + (parseFloat(e.hours) || 0), 0) });
  }

  // GET /api/time/entries/:entryId
  async getById(req, res) {
    const entry = await this.db.findById(TABLES.TIME_ENTRIES, req.params.entryId, req.tenantId);
    if (!entry) return ResponseHelper.notFound(res, 'Time entry not found');
    if (req.currentUser.role === 'TEAM_MEMBER' && String(entry.user_id) !== req.currentUser.id)
      return ResponseHelper.forbidden(res, 'Cannot view another user\'s time entry');
    return ResponseHelper.success(res, entry);
  }

  // POST /api/time/entries
  async create(req, res) {
    const { project_id, task_id, hours, description, is_billable, start_time, end_time } = req.body;
    // Accept both `entry_date` (preferred) and legacy `date`
    const entryDate = req.body.entry_date || req.body.date;
    const tenantId = req.tenantId;
    const userId   = req.currentUser.id;

    // Calculate effective hours from start_time/end_time if hours not provided
    let effectiveHours = parseFloat(hours);
    if (start_time && end_time && !hours) {
      const [sh, sm] = start_time.split(':').map(Number);
      const [eh, em] = end_time.split(':').map(Number);
      const diffMins = (eh * 60 + em) - (sh * 60 + sm);
      effectiveHours = Math.round(diffMins / 60 * 100) / 100; // round to 2 decimal places
    }

    if (!entryDate || !effectiveHours) return ResponseHelper.validationError(res, 'entry_date and hours are required');
    if (effectiveHours <= 0 || effectiveHours > 24) return ResponseHelper.validationError(res, 'hours must be greater than 0 and at most 24');
    // Time can only be logged for today or earlier — never the future.
    // Compare against the IST "today" the rest of the service uses.
    const todayIST = new Date(Date.now() + 5.5 * 3600000).toISOString().slice(0, 10);
    if (String(entryDate).slice(0, 10) > todayIST) {
      return ResponseHelper.validationError(res, 'Date cannot be in the future');
    }
    // Task is mandatory — every time entry must be tied to a specific task so
    // owners can see where the hours went. (The frontend also enforces this,
    // but we validate here too in case other clients call the API directly.)
    if (!task_id || String(task_id) === '0' || String(task_id).trim() === '') {
      return ResponseHelper.validationError(res, 'task_id is required');
    }

    // Resolve project_id: use provided value, or fall back to the task's project.
    // Never store 0 — the time_entries.project_id column has a FK constraint on projects.ROWID.
    let resolvedProjectId = project_id && String(project_id) !== '0' ? String(project_id) : null;
    if (!resolvedProjectId && task_id && String(task_id) !== '0') {
      try {
        const taskRows = await this.db.findWhere(TABLES.TASKS, tenantId, `ROWID = '${String(task_id)}'`, { limit: 1 });
        const pid = taskRows[0]?.project_id;
        if (pid && String(pid) !== '0') resolvedProjectId = String(pid);
      } catch (_) { /* cross-service lookup failed — leave null */ }
    }

    const insertPayload = {
      tenant_id:   String(tenantId),
      ...(resolvedProjectId ? { project_id: resolvedProjectId } : {}),
      task_id:     String(task_id || 0),
      user_id:     String(userId),
      entry_date:  entryDate,
      hours:       effectiveHours,
      start_time:  start_time || '',
      end_time:    end_time   || '',
      description: description || '',
      is_billable: String(is_billable) === 'true' ? 'true' : 'false',
      status:      TIME_STATUS.DRAFT,
    };
    const row = await this.db.insert(TABLES.TIME_ENTRIES, insertPayload);

    await this.audit.log({ tenantId, entityType: 'TIME_ENTRY', entityId: row.ROWID, action: AUDIT_ACTION.CREATE, newValue: row, performedBy: userId });

    // Auto-submit if the task requires approval (flag passed from frontend — tasks table is in task_sprint_service, not accessible here)
    const taskIdNum = parseInt(task_id, 10);
    if (taskIdNum && taskIdNum > 0) {
      try {
        const reqApproval = req.body.require_approval;
        const needsApproval = reqApproval === 'true' || reqApproval === true || reqApproval === 1;

        if (needsApproval) {
          // Resolve approver: task owner (created_by) takes priority over reporting manager
          let approverId = '';
          try {
            const taskRows = await this.db.query(`SELECT created_by FROM ${TABLES.TASKS} WHERE ROWID = ${taskIdNum} LIMIT 1`);
            if (taskRows[0]?.created_by) approverId = String(taskRows[0].created_by);
          } catch (_) { /* fall through to RM */ }

          if (!approverId) {
            const profileRows = await this.db.findWhere(TABLES.USER_PROFILES, tenantId, `user_id = '${userId}'`, { limit: 1 });
            approverId = profileRows[0]?.reporting_manager_id ? String(profileRows[0].reporting_manager_id) : '';
          }

          // If the submitter IS the approver (task owner logging their own time), auto-approve
          if (approverId && approverId === String(userId)) {
            await this.db.update(TABLES.TIME_ENTRIES, { ROWID: row.ROWID, status: TIME_STATUS.APPROVED, submitted_at: DataStoreService.fmtDT(new Date()) });
            row.status = TIME_STATUS.APPROVED;
          } else {
            // Mark as SUBMITTED regardless of whether an approver is found
            await this.db.update(TABLES.TIME_ENTRIES, { ROWID: row.ROWID, status: TIME_STATUS.SUBMITTED, submitted_at: DataStoreService.fmtDT(new Date()) });
            row.status = TIME_STATUS.SUBMITTED;

            if (approverId) {
              await this.db.insert(TABLES.TIME_APPROVAL_REQUESTS, {
                tenant_id: String(tenantId),
                time_entry_id: String(row.ROWID),
                requested_by: String(userId),
                assigned_to: approverId,
                status: 'PENDING',
              });
              const approverRows = await this.db.query(`SELECT email, name FROM ${TABLES.USERS} WHERE ROWID = ${approverId} LIMIT 1`);
              if (approverRows[0]) {
                const userName   = req.currentUser.name || 'A team member';
                const hoursLabel = _formatHours(effectiveHours);
                const dateLabel  = _formatDate(entryDate);
                await this.notif.send({
                  toEmail:  approverRows[0].email,
                  subject:  `[DSV OpsPulse] Time entry awaiting your approval`,
                  htmlBody: _pendingApprovalEmailHtml({
                    approverName:  approverRows[0].name,
                    submitterName: userName,
                    hoursLabel,
                    dateLabel,
                    description:   description || '',
                    timeEntryId:   String(row.ROWID),
                    tenantSlug:    req.currentUser?.tenantSlug || '',
                  }),
                });
                await this.notif.sendInApp({ tenantId, userId: approverId, title: 'Time Approval Needed', message: `${userName} submitted ${hoursLabel} on ${dateLabel} for approval`, type: NOTIFICATION_TYPE.TIME_APPROVAL_NEEDED, entityType: 'TIME_ENTRY', entityId: String(row.ROWID) });
              }
            } else {
              console.warn(`[TimeController.create] no approver found for task ${taskIdNum} / user ${userId} — entry submitted but no approval request created`);
            }
          }
        }
      } catch (autoSubmitErr) {
        console.error('[TimeController.create] auto-submit error:', autoSubmitErr.message, autoSubmitErr.stack);
      }
    }

    return ResponseHelper.created(res, row);
  }

  // PUT /api/time/entries/:entryId
  async update(req, res) {
    const entry = await this.db.findById(TABLES.TIME_ENTRIES, req.params.entryId, req.tenantId);
    if (!entry) return ResponseHelper.notFound(res, 'Time entry not found');
    if (![TIME_STATUS.DRAFT, TIME_STATUS.REJECTED, TIME_STATUS.SUBMITTED].includes(entry.status))
      return ResponseHelper.validationError(res, 'Only DRAFT, REJECTED, or SUBMITTED entries can be edited');
    if (String(entry.user_id) !== req.currentUser.id)
      return ResponseHelper.forbidden(res, 'Cannot edit another user\'s time entry');

    // Auto-retract: cancel pending approval when editing a submitted entry
    if (entry.status === TIME_STATUS.SUBMITTED) {
      // Quote AND escape the id so it can't break out of the literal (was
      // unquoted before, which made this trivially injectable).
      const eid = DataStoreService.escape(req.params.entryId);
      const approvalRows = await this.db.findWhere(
        TABLES.TIME_APPROVAL_REQUESTS, req.tenantId,
        `time_entry_id = '${eid}' AND status = 'PENDING'`, { limit: 1 }
      );
      if (approvalRows[0]) {
        await this.db.update(TABLES.TIME_APPROVAL_REQUESTS, { ROWID: approvalRows[0].ROWID, status: 'CANCELLED' });
      }
    }

    const { hours, description, is_billable, task_id, start_time, end_time } = req.body;
    const updates = {};
    if (hours !== undefined) { if (parseFloat(hours) < 0.25 || parseFloat(hours) > 24) return ResponseHelper.validationError(res, 'hours must be 0.25–24'); updates.hours = parseFloat(hours); }
    if (description !== undefined) updates.description = description;
    if (is_billable !== undefined) updates.is_billable = is_billable ? 'true' : 'false';
    if (task_id !== undefined)     updates.task_id     = task_id;
    if (start_time !== undefined)  updates.start_time  = start_time || '';
    if (end_time !== undefined)    updates.end_time    = end_time   || '';

    const updated = await this.db.update(TABLES.TIME_ENTRIES, { ROWID: req.params.entryId, ...updates, status: TIME_STATUS.DRAFT });
    await this.audit.log({ tenantId: req.tenantId, entityType: 'TIME_ENTRY', entityId: req.params.entryId, action: AUDIT_ACTION.UPDATE, oldValue: entry, newValue: updated, performedBy: req.currentUser.id });
    return ResponseHelper.success(res, updated);
  }

  // DELETE /api/time/entries/:entryId
  async remove(req, res) {
    const entry = await this.db.findById(TABLES.TIME_ENTRIES, req.params.entryId, req.tenantId);
    if (!entry) return ResponseHelper.notFound(res, 'Time entry not found');
    if (entry.status !== TIME_STATUS.DRAFT) return ResponseHelper.validationError(res, 'Only DRAFT entries can be deleted');
    if (String(entry.user_id) !== req.currentUser.id) return ResponseHelper.forbidden(res, 'Cannot delete another user\'s entry');
    await this.db.delete(TABLES.TIME_ENTRIES, req.params.entryId);
    return ResponseHelper.success(res, { message: 'Entry deleted' });
  }

  // PATCH /api/time/entries/:entryId/submit
  async submit(req, res) {
    const entry = await this.db.findById(TABLES.TIME_ENTRIES, req.params.entryId, req.tenantId);
    if (!entry) return ResponseHelper.notFound(res, 'Time entry not found');
    if (entry.status !== TIME_STATUS.DRAFT && entry.status !== TIME_STATUS.REJECTED)
      return ResponseHelper.validationError(res, 'Only DRAFT or REJECTED entries can be submitted');
    if (String(entry.user_id) !== req.currentUser.id) return ResponseHelper.forbidden(res, 'Cannot submit another user\'s entry');

    // Resolve approver: task owner (created_by) takes priority over reporting manager
    let approverId = '';
    if (entry.task_id) {
      try {
        const taskRows = await this.db.query(`SELECT created_by FROM ${TABLES.TASKS} WHERE ROWID = ${parseInt(entry.task_id, 10)} LIMIT 1`);
        if (taskRows[0]?.created_by) approverId = String(taskRows[0].created_by);
      } catch (_) { /* fall through to RM */ }
    }
    if (!approverId) {
      const profileRows = await this.db.findWhere(TABLES.USER_PROFILES, req.tenantId, `user_id = '${req.currentUser.id}'`, { limit: 1 });
      approverId = profileRows[0]?.reporting_manager_id ? String(profileRows[0].reporting_manager_id) : '';
    }

    // If the submitter IS the approver (task owner submitting their own time), auto-approve
    if (approverId && approverId === req.currentUser.id) {
      await this.db.update(TABLES.TIME_ENTRIES, { ROWID: req.params.entryId, status: TIME_STATUS.APPROVED, submitted_at: DataStoreService.fmtDT(new Date()) });
    } else {
      await this.db.update(TABLES.TIME_ENTRIES, { ROWID: req.params.entryId, status: TIME_STATUS.SUBMITTED, submitted_at: DataStoreService.fmtDT(new Date()) });

      // Create approval request
      if (approverId) {
        await this.db.insert(TABLES.TIME_APPROVAL_REQUESTS, {
          tenant_id: req.tenantId, time_entry_id: req.params.entryId,
          requested_by: req.currentUser.id, assigned_to: approverId, status: 'PENDING',
        });

        const approverRows = await this.db.query(`SELECT email, name FROM ${TABLES.USERS} WHERE ROWID = ${approverId} LIMIT 1`);
        if (approverRows[0]) {
          const hoursLabel = _formatHours(entry.hours);
          const dateLabel  = _formatDate(entry.entry_date);
          await this.notif.send({
            toEmail:  approverRows[0].email,
            subject:  `[DSV OpsPulse] Time entry awaiting your approval`,
            htmlBody: _pendingApprovalEmailHtml({
              approverName:  approverRows[0].name,
              submitterName: req.currentUser.name,
              hoursLabel,
              dateLabel,
              description:   entry.description || '',
              timeEntryId:   String(req.params.entryId),
              tenantSlug:    req.currentUser?.tenantSlug || '',
            }),
          });
          await this.notif.sendInApp({ tenantId: req.tenantId, userId: approverId, title: 'Time Approval Needed', message: `${req.currentUser.name} submitted ${hoursLabel} on ${dateLabel} for approval`, type: NOTIFICATION_TYPE.TIME_APPROVAL_NEEDED, entityType: 'TIME_ENTRY', entityId: req.params.entryId });
        }
      }
    }

    await this.audit.log({ tenantId: req.tenantId, entityType: 'TIME_ENTRY', entityId: req.params.entryId, action: AUDIT_ACTION.SUBMIT, newValue: { status: approverId && approverId === req.currentUser.id ? TIME_STATUS.APPROVED : TIME_STATUS.SUBMITTED }, performedBy: req.currentUser.id });
    return ResponseHelper.success(res, { message: 'Entry submitted for approval' });
  }

  // PATCH /api/time/entries/:entryId/retract
  async retract(req, res) {
    const entry = await this.db.findById(TABLES.TIME_ENTRIES, req.params.entryId, req.tenantId);
    if (!entry) return ResponseHelper.notFound(res, 'Time entry not found');
    if (entry.status !== TIME_STATUS.SUBMITTED) return ResponseHelper.validationError(res, 'Only SUBMITTED entries can be retracted');
    if (String(entry.user_id) !== req.currentUser.id) return ResponseHelper.forbidden(res, 'Cannot retract another user\'s entry');

    await this.db.update(TABLES.TIME_ENTRIES, { ROWID: req.params.entryId, status: TIME_STATUS.DRAFT });

    // Cancel pending approval request — quote & escape the id, was unquoted before.
    const eid = DataStoreService.escape(req.params.entryId);
    const approvalRows = await this.db.findWhere(TABLES.TIME_APPROVAL_REQUESTS, req.tenantId, `time_entry_id = '${eid}' AND status = 'PENDING'`, { limit: 1 });
    if (approvalRows[0]) await this.db.update(TABLES.TIME_APPROVAL_REQUESTS, { ROWID: approvalRows[0].ROWID, status: 'CANCELLED' });

    return ResponseHelper.success(res, { message: 'Entry retracted to DRAFT' });
  }

  // GET /api/time/analytics/team?period=week|month|last_month|custom&date_from=&date_to=&user_id=&project_id=
  async teamAnalytics(req, res) {
    const { period = 'week', date_from, date_to, user_id, project_id } = req.query;
    const tenantId = req.tenantId;

    // Compute date range from period
    const istNow = new Date(Date.now() + 5.5 * 3600000);
    let from, to;
    if (period === 'week') {
      const dayOfWk  = istNow.getUTCDay();
      const diffToMon = (dayOfWk === 0 ? -6 : 1 - dayOfWk);
      const mon = new Date(istNow); mon.setUTCDate(istNow.getUTCDate() + diffToMon);
      const sun = new Date(mon);    sun.setUTCDate(mon.getUTCDate() + 6);
      from = mon.toISOString().split('T')[0];
      to   = sun.toISOString().split('T')[0];
    } else if (period === 'month') {
      from = `${istNow.getUTCFullYear()}-${String(istNow.getUTCMonth() + 1).padStart(2, '0')}-01`;
      const lastDay = new Date(istNow.getUTCFullYear(), istNow.getUTCMonth() + 1, 0);
      to   = lastDay.toISOString().split('T')[0];
    } else if (period === 'last_month') {
      const lastMonth = new Date(istNow.getUTCFullYear(), istNow.getUTCMonth() - 1, 1);
      from = `${lastMonth.getUTCFullYear()}-${String(lastMonth.getUTCMonth() + 1).padStart(2, '0')}-01`;
      const lastDay = new Date(istNow.getUTCFullYear(), istNow.getUTCMonth(), 0);
      to   = lastDay.toISOString().split('T')[0];
    } else {
      // custom — caller must supply date_from / date_to
      from = date_from;
      to   = date_to;
    }
    if (!from || !to) return ResponseHelper.validationError(res, 'date_from and date_to are required for period=custom');

    // Team-scope: resolve which user IDs this caller may see.
    const MANAGER_ROLES_A = ['TENANT_ADMIN', 'PMO', 'DELIVERY_LEAD'];
    const me_a = req.currentUser;
    const userPerms_a  = Array.isArray(me_a.permissions) ? me_a.permissions : [];
    const canSeeAll_a = MANAGER_ROLES_A.includes(me_a.role)
      || me_a.dataScope === 'ORG_WIDE'
      || me_a.dataScope === 'SUBORDINATES'
      || userPerms_a.includes('PROJECT_DATA_VIEW_ALL');
    const hasTeamView_a = userPerms_a.includes(PERMISSIONS.TIME_TEAM_VIEW);
    let allowedUserIds = null; // null → unrestricted
    if (!canSeeAll_a) {
      const callerUid_a = String(me_a.id);
      if (hasTeamView_a || await this._isTeamLead(tenantId, callerUid_a)) {
        const scope = new TeamScopeService(this.db);
        allowedUserIds = new Set((await scope.getTeamPeerUserIds(tenantId, callerUid_a)).map(String));
      }
    }

    // Build query for tenant
    let where = `entry_date >= '${DataStoreService.escape(from)}' AND entry_date <= '${DataStoreService.escape(to)}'`;
    if (user_id)    where += ` AND user_id = '${DataStoreService.escape(user_id)}'`;
    if (project_id) where += ` AND project_id = '${DataStoreService.escape(project_id)}'`;

    let [entries, users, projects] = await Promise.all([
      this.db.queryAll(
        `SELECT * FROM ${TABLES.TIME_ENTRIES} WHERE tenant_id = '${DataStoreService.escape(tenantId)}' AND ${where} ORDER BY entry_date ASC`
      ),
      this.db.findAll(TABLES.USERS,    { tenant_id: tenantId }, { limit: 200 }),
      this.db.findAll(TABLES.PROJECTS, { tenant_id: tenantId }, { limit: 200 }),
    ]);

    // Apply team scope filter to entries and user list
    if (allowedUserIds) {
      entries = entries.filter((e) => allowedUserIds.has(String(e.user_id)));
      users   = users.filter((u) => allowedUserIds.has(String(u.ROWID)));
    }

    // Fetch org role names for users
    const orgRoleRows = await this.db.queryAll(
      `SELECT * FROM ${TABLES.USER_ORG_ROLES} WHERE tenant_id = '${DataStoreService.escape(tenantId)}'`
    ).catch(() => []);
    const orgRoleIdToName = {};
    const orgRoleDefs = await this.db.findAll(TABLES.ORG_ROLES, { tenant_id: tenantId }, { limit: 200 }).catch(() => []);
    orgRoleDefs.forEach(r => { orgRoleIdToName[String(r.ROWID)] = r.name || ''; });
    const userOrgRoleMap = {};
    orgRoleRows.forEach(r => { userOrgRoleMap[String(r.user_id)] = orgRoleIdToName[String(r.org_role_id)] || ''; });

    const userMap = {};
    users.forEach(u => { userMap[String(u.ROWID)] = u; });
    const projMap = {};
    projects.forEach(p => { projMap[String(p.ROWID)] = { name: p.name || '', id: String(p.ROWID) }; });

    // Aggregate per member
    const byMember = {};
    for (const e of entries) {
      const uid = String(e.user_id);
      const hrs = parseFloat(e.hours) || 0;
      // Catalyst may return boolean true or string 'true' depending on column type
      const isBillable = String(e.is_billable).toLowerCase() === 'true';
      const pid = String(e.project_id);
      const entryDate = String(e.entry_date).split('T')[0].split(' ')[0];
      const status = e.status || TIME_STATUS.DRAFT;

      if (!byMember[uid]) {
        const u = userMap[uid] || {};
        byMember[uid] = {
          user_id:        uid,
          user_name:      u.name || 'Unknown',
          user_avatar_url: u.avatar_url || '',
          org_role_name:  userOrgRoleMap[uid] || '',
          total_hours:    0,
          billable_hours: 0,
          non_billable_hours: 0,
          entries_count:  0,
          days_logged:    new Set(),
          approved_hours: 0,
          submitted_hours: 0,
          draft_hours:    0,
          by_project:     {},
        };
      }

      const m = byMember[uid];
      m.total_hours    += hrs;
      m.entries_count  += 1;
      m.days_logged.add(entryDate);
      if (isBillable) m.billable_hours += hrs; else m.non_billable_hours += hrs;
      if (status === TIME_STATUS.APPROVED)   m.approved_hours  += hrs;
      else if (status === TIME_STATUS.SUBMITTED) m.submitted_hours += hrs;
      else m.draft_hours += hrs;

      // Per-project breakdown
      if (!m.by_project[pid]) {
        m.by_project[pid] = {
          project_id:     pid,
          project_name:   projMap[pid]?.name || 'Unknown Project',
          total_hours:    0,
          billable_hours: 0,
          non_billable_hours: 0,
          entries_count:  0,
        };
      }
      m.by_project[pid].total_hours    += hrs;
      m.by_project[pid].entries_count  += 1;
      if (isBillable) m.by_project[pid].billable_hours += hrs;
      else m.by_project[pid].non_billable_hours += hrs;
    }

    // Serialise
    const members = Object.values(byMember).map(m => ({
      ...m,
      total_hours:        Math.round(m.total_hours * 100) / 100,
      billable_hours:     Math.round(m.billable_hours * 100) / 100,
      non_billable_hours: Math.round(m.non_billable_hours * 100) / 100,
      approved_hours:     Math.round(m.approved_hours * 100) / 100,
      submitted_hours:    Math.round(m.submitted_hours * 100) / 100,
      draft_hours:        Math.round(m.draft_hours * 100) / 100,
      billable_pct:       m.total_hours > 0 ? Math.round((m.billable_hours / m.total_hours) * 1000) / 10 : 0,
      days_logged:        m.days_logged.size,
      by_project:         Object.values(m.by_project).sort((a, b) => b.total_hours - a.total_hours),
    })).sort((a, b) => b.total_hours - a.total_hours);

    const totalHours    = Math.round(members.reduce((s, m) => s + m.total_hours, 0) * 100) / 100;
    const billableHours = Math.round(members.reduce((s, m) => s + m.billable_hours, 0) * 100) / 100;

    return ResponseHelper.success(res, {
      period: { from, to, label: period },
      summary: {
        total_hours:        totalHours,
        billable_hours:     billableHours,
        non_billable_hours: Math.round((totalHours - billableHours) * 100) / 100,
        billable_pct:       totalHours > 0 ? Math.round((billableHours / totalHours) * 1000) / 10 : 0,
        active_members:     members.length,
        total_entries:      entries.length,
      },
      members,
    });
  }

  // GET /api/time/entries/analytics/org?date_from=&date_to=&project_id=&user_id=&user_ids=&is_billable=&status=
  //
  // Server-side aggregation for the org analytics tab. Every breakdown is built
  // with ZCQL GROUP BY / SUM() / COUNT() so we never transfer raw entry rows and
  // never trip the 300-row SELECT cap (group counts stay well under it). This
  // replaces the old client-side aggregation that summed only the first page of
  // entries and therefore under-counted "All members" totals.
  async orgAnalytics(req, res) {
    const { date_from, date_to, project_id, user_id, user_ids, is_billable, status } = req.query;
    const tenantId = req.tenantId;
    if (!date_from || !date_to) {
      return ResponseHelper.validationError(res, 'date_from and date_to are required');
    }

    const esc = DataStoreService.escape;
    const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

    // ── Permission scope: which user IDs may this caller aggregate over? ──
    // Mirrors list()'s visibility ladder. null → unrestricted (whole tenant).
    const MANAGER_ROLES = ['TENANT_ADMIN', 'PMO', 'DELIVERY_LEAD'];
    const me = req.currentUser;
    const userPerms = Array.isArray(me.permissions) ? me.permissions : [];
    const canSeeAll = MANAGER_ROLES.includes(me.role)
      || me.dataScope === 'ORG_WIDE'
      || me.dataScope === 'SUBORDINATES'
      || userPerms.includes('PROJECT_DATA_VIEW_ALL');
    let scopeIds = null;
    if (!canSeeAll) {
      const callerUid = String(me.id);
      if (userPerms.includes(PERMISSIONS.TIME_TEAM_VIEW) || await this._isTeamLead(tenantId, callerUid)) {
        const scope = new TeamScopeService(this.db);
        scopeIds = new Set((await scope.getTeamPeerUserIds(tenantId, callerUid)).map(String));
      } else {
        scopeIds = new Set([callerUid]);
      }
    }

    // Requested member filter (single user, or a team's member list), then
    // intersect with the permission scope.
    let userFilter = null;
    if (user_id) userFilter = new Set([String(user_id)]);
    else if (user_ids) userFilter = new Set(String(user_ids).split(',').map((s) => s.trim()).filter(Boolean));
    if (scopeIds) {
      userFilter = userFilter
        ? new Set([...userFilter].filter((id) => scopeIds.has(id)))
        : scopeIds;
    }

    const emptyPayload = {
      period:  { from: date_from, to: date_to },
      summary: { total_hours: 0, billable_hours: 0, non_billable_hours: 0, total_entries: 0 },
      by_user: [], by_project: [], by_task: [], by_day: [], by_status: [],
    };
    if (userFilter && userFilter.size === 0) return ResponseHelper.success(res, emptyPayload);

    // ── Shared WHERE clause ──
    let where = `tenant_id = '${esc(String(tenantId))}'`
      + ` AND entry_date >= '${esc(date_from)}' AND entry_date <= '${esc(date_to)}'`;
    if (project_id) where += ` AND project_id = '${esc(project_id)}'`;
    if (userFilter) {
      const inList = [...userFilter].map((id) => `'${esc(id)}'`).join(',');
      where += ` AND user_id IN (${inList})`;
    }
    if (status) where += ` AND status = '${esc(status)}'`;
    if (is_billable === 'true')  where += ` AND is_billable = 'true'`;
    if (is_billable === 'false') where += ` AND is_billable = 'false'`;

    // ── Aggregate helpers (queryAll pages past ZCQL's 300-row GROUP BY cap) ──
    const T = TABLES.TIME_ENTRIES;

    // GROUP BY <col> → Map<key, number>. Reads the aggregate as the first
    // non-key column so it works regardless of how ZCQL aliases SUM()/COUNT().
    const groupAgg = async (col, aggExpr, w) => {
      const rows = await this.db.queryAll(`SELECT ${col}, ${aggExpr} FROM ${T} WHERE ${w} GROUP BY ${col}`);
      const map = new Map();
      for (const r of rows) {
        const key = r[col] == null ? '' : String(r[col]);
        let val = 0;
        for (const [k, v] of Object.entries(r)) { if (k === col) continue; val = Number(v) || 0; break; }
        map.set(key, val);
      }
      return map;
    };

    // GROUP BY <col>, is_billable → Map<key, {total, billable}>. The billable
    // split is decided on the STORED is_billable value (normalised in JS), which
    // is robust whether Catalyst returns boolean true or the string 'true'. A
    // brittle `is_billable = 'true'` WHERE filter would read 0 billable hours for
    // a boolean column — the same bug class as my-week's billable_hours.
    const groupHoursSplit = async (col, w) => {
      const rows = await this.db.queryAll(`SELECT ${col}, is_billable, SUM(hours) FROM ${T} WHERE ${w} GROUP BY ${col}, is_billable`);
      const map = new Map();
      for (const r of rows) {
        const key = r[col] == null ? '' : String(r[col]);
        const billable = String(r.is_billable).toLowerCase() === 'true';
        let hrs = 0;
        for (const [k, v] of Object.entries(r)) {
          if (k === col || k === 'is_billable') continue;
          hrs = Number(v) || 0; break;
        }
        const cur = map.get(key) || { total: 0, billable: 0 };
        cur.total += hrs;
        if (billable) cur.billable += hrs;
        map.set(key, cur);
      }
      return map;
    };

    // Total entry count via a scalar COUNT — a single row, immune to the cap.
    const scalarCount = async (w) => {
      const rows = await this.db.query(`SELECT COUNT(ROWID) FROM ${T} WHERE ${w}`);
      return rows && rows.length ? (Number(Object.values(rows[0])[0]) || 0) : 0;
    };

    const [
      billSummary, cntTotal,
      uH, uCount,
      pH, pCount,
      tH, tCount,
      dH, dCount,
      sCount, pmPairs,
    ] = await Promise.all([
      groupAgg('is_billable', 'SUM(hours)',   where),  // ≤2 rows → exact headline split
      scalarCount(where),
      groupHoursSplit('user_id',    where),
      groupAgg('user_id',    'COUNT(ROWID)',  where),
      groupHoursSplit('project_id', where),
      groupAgg('project_id', 'COUNT(ROWID)',  where),
      groupHoursSplit('task_id',    where),
      groupAgg('task_id',    'COUNT(ROWID)',  where),
      groupHoursSplit('entry_date', where),
      groupAgg('entry_date', 'COUNT(ROWID)',  where),
      groupAgg('status',     'COUNT(ROWID)',  where),
      // Distinct (project, member) pairs → per-project member count. GROUP BY
      // dedupes the pairs; queryAll pages them so we never lose any.
      this.db.queryAll(`SELECT project_id, user_id FROM ${T} WHERE ${where} GROUP BY project_id, user_id`),
    ]);

    let sumTotal = 0, sumBill = 0;
    for (const [k, v] of billSummary) { sumTotal += v; if (String(k).toLowerCase() === 'true') sumBill += v; }

    // ── Enrichment: names for the IDs that actually appeared ──
    const validId = (id) => id && id !== '0' && id !== 'null' && id !== 'undefined';
    const userIds = [...uH.keys()].filter(validId);
    const projIds = [...pH.keys()].filter(validId);
    const taskIds = [...tH.keys()].filter(validId);
    const userMap = {}, projMap = {}, taskMap = {};
    const fetches = [];
    if (userIds.length) {
      const inList = userIds.map((id) => `'${esc(id)}'`).join(',');
      fetches.push(this.db.query(`SELECT ROWID, name, avatar_url FROM ${TABLES.USERS} WHERE ROWID IN (${inList})`)
        .then((rows) => rows.forEach((u) => { userMap[String(u.ROWID)] = u; })).catch(() => {}));
    }
    if (projIds.length) {
      const inList = projIds.map((id) => `'${esc(id)}'`).join(',');
      fetches.push(this.db.query(`SELECT ROWID, name FROM ${TABLES.PROJECTS} WHERE ROWID IN (${inList})`)
        .then((rows) => rows.forEach((p) => { projMap[String(p.ROWID)] = p.name || ''; })).catch(() => {}));
    }
    if (taskIds.length) {
      const inList = taskIds.map((id) => `'${esc(id)}'`).join(',');
      fetches.push(this.db.query(`SELECT ROWID, title, project_id FROM ${TABLES.TASKS} WHERE ROWID IN (${inList})`)
        .then((rows) => rows.forEach((t) => { taskMap[String(t.ROWID)] = t; })).catch(() => {}));
    }
    await Promise.all(fetches);
    // projMap may miss projects only referenced via tasks — backfill from tasks
    Object.values(taskMap).forEach((t) => {
      const pid = String(t.project_id || '');
      if (pid && projMap[pid] === undefined) projMap[pid] = projMap[pid] || '';
    });

    // ── Assemble breakdowns ──
    const by_user = userIds.map((uid) => ({
      user_id: uid,
      user_name: userMap[uid]?.name || 'Unknown',
      user_avatar_url: userMap[uid]?.avatar_url || '',
      total_hours:    round2(uH.get(uid)?.total),
      billable_hours: round2(uH.get(uid)?.billable),
      entries_count:  Math.round(uCount.get(uid) || 0),
    })).sort((a, b) => b.total_hours - a.total_hours);

    const membersByProj = {};
    for (const r of pmPairs) {
      const pid = String(r.project_id || ''); const uid = String(r.user_id || '');
      if (!pid) continue;
      (membersByProj[pid] = membersByProj[pid] || new Set()).add(uid);
    }
    const by_project = projIds.map((pid) => ({
      project_id: pid,
      project_name: projMap[pid] || 'Unknown',
      total_hours:    round2(pH.get(pid)?.total),
      billable_hours: round2(pH.get(pid)?.billable),
      entries_count:  Math.round(pCount.get(pid) || 0),
      member_count:   membersByProj[pid]?.size || 0,
    })).sort((a, b) => b.total_hours - a.total_hours);

    const by_task = taskIds.map((tid) => {
      const task = taskMap[tid] || {};
      const pid = String(task.project_id || '');
      return {
        task_id: tid,
        task_name: task.title || 'Untitled task',
        project_name: projMap[pid] || '',
        total_hours:    round2(tH.get(tid)?.total),
        billable_hours: round2(tH.get(tid)?.billable),
        entries_count:  Math.round(tCount.get(tid) || 0),
      };
    }).sort((a, b) => b.total_hours - a.total_hours).slice(0, 20);

    const by_day = [...dH.keys()].map((d) => ({
      date: String(d).split('T')[0].split(' ')[0],
      total_hours:    round2(dH.get(d)?.total),
      billable_hours: round2(dH.get(d)?.billable),
      entries_count:  Math.round(dCount.get(d) || 0),
    })).sort((a, b) => a.date.localeCompare(b.date));

    const by_status = [...sCount.keys()].filter(Boolean).map((st) => ({
      status: st, entries_count: Math.round(sCount.get(st) || 0),
    }));

    const totalHours    = round2(sumTotal);
    const billableHours = round2(sumBill);

    return ResponseHelper.success(res, {
      period:  { from: date_from, to: date_to },
      summary: {
        total_hours:        totalHours,
        billable_hours:     billableHours,
        non_billable_hours: round2(totalHours - billableHours),
        total_entries:      Math.round(cntTotal),
      },
      by_user, by_project, by_task, by_day, by_status,
    });
  }

  // GET /api/time/entries/analytics/user?user_id=...&period=week|month|last_month|custom&date_from=&date_to=
  async userActivity(req, res) {
    const { user_id, period = 'month', date_from, date_to } = req.query;
    const tenantId = req.tenantId;
    if (!user_id) return ResponseHelper.validationError(res, 'user_id is required');

    // Guard: non-managers can only view their own activity OR a team peer's.
    const me_b = req.currentUser;
    const MANAGER_ROLES_B = ['TENANT_ADMIN', 'PMO', 'DELIVERY_LEAD'];
    const userPerms_b   = Array.isArray(me_b.permissions) ? me_b.permissions : [];
    const canSeeAll_b = MANAGER_ROLES_B.includes(me_b.role)
      || me_b.dataScope === 'ORG_WIDE'
      || me_b.dataScope === 'SUBORDINATES'
      || userPerms_b.includes('PROJECT_DATA_VIEW_ALL');
    if (!canSeeAll_b && String(me_b.id) !== String(user_id)) {
      const hasTeamView_b = userPerms_b.includes(PERMISSIONS.TIME_TEAM_VIEW);
      const callerUid_b   = String(me_b.id);
      const isLead_b = hasTeamView_b || await this._isTeamLead(tenantId, callerUid_b);
      if (isLead_b) {
        const scope   = new TeamScopeService(this.db);
        const peers   = await scope.getTeamPeerUserIds(tenantId, callerUid_b);
        const allowed = new Set(peers.map(String));
        if (!allowed.has(String(user_id))) return ResponseHelper.forbidden(res, 'Cannot view activity for this user');
      } else {
        return ResponseHelper.forbidden(res, 'Cannot view activity for this user');
      }
    }

    const istNow = new Date(Date.now() + 5.5 * 3600000);
    let from, to;
    if (period === 'week') {
      const dow = istNow.getUTCDay();
      const mon = new Date(istNow); mon.setUTCDate(istNow.getUTCDate() + (dow === 0 ? -6 : 1 - dow));
      const sun = new Date(mon);   sun.setUTCDate(mon.getUTCDate() + 6);
      from = mon.toISOString().split('T')[0];
      to   = sun.toISOString().split('T')[0];
    } else if (period === 'month') {
      from = `${istNow.getUTCFullYear()}-${String(istNow.getUTCMonth() + 1).padStart(2, '0')}-01`;
      to   = new Date(istNow.getUTCFullYear(), istNow.getUTCMonth() + 1, 0).toISOString().split('T')[0];
    } else if (period === 'last_month') {
      const lm = new Date(istNow.getUTCFullYear(), istNow.getUTCMonth() - 1, 1);
      from = `${lm.getUTCFullYear()}-${String(lm.getUTCMonth() + 1).padStart(2, '0')}-01`;
      to   = new Date(istNow.getUTCFullYear(), istNow.getUTCMonth(), 0).toISOString().split('T')[0];
    } else {
      from = date_from; to = date_to;
    }
    if (!from || !to) return ResponseHelper.validationError(res, 'date_from and date_to required for custom period');

    const entries = await this.db.queryAll(
      `SELECT * FROM ${TABLES.TIME_ENTRIES} WHERE tenant_id = '${DataStoreService.escape(tenantId)}' AND user_id = '${DataStoreService.escape(user_id)}' AND entry_date >= '${from}' AND entry_date <= '${to}' ORDER BY entry_date ASC`
    );

    // Aggregate by day
    const byDay = {};
    for (const e of entries) {
      const date   = String(e.entry_date).split('T')[0].split(' ')[0];
      const hrs    = parseFloat(e.hours) || 0;
      const bill   = String(e.is_billable).toLowerCase() === 'true';
      const status = e.status || TIME_STATUS.DRAFT;
      if (!byDay[date]) byDay[date] = { date, total_hours: 0, billable_hours: 0, non_billable_hours: 0, entries_count: 0, approved_hours: 0, submitted_hours: 0, draft_hours: 0 };
      const d = byDay[date];
      d.total_hours    += hrs; d.entries_count += 1;
      if (bill) d.billable_hours += hrs; else d.non_billable_hours += hrs;
      if (status === TIME_STATUS.APPROVED)        d.approved_hours  += hrs;
      else if (status === TIME_STATUS.SUBMITTED)  d.submitted_hours += hrs;
      else                                        d.draft_hours     += hrs;
    }

    const daily = Object.values(byDay).sort((a, b) => a.date.localeCompare(b.date)).map((d) => ({
      date:               d.date,
      total_hours:        Math.round(d.total_hours        * 100) / 100,
      billable_hours:     Math.round(d.billable_hours     * 100) / 100,
      non_billable_hours: Math.round(d.non_billable_hours * 100) / 100,
      entries_count:      d.entries_count,
      approved_hours:     Math.round(d.approved_hours     * 100) / 100,
      submitted_hours:    Math.round(d.submitted_hours    * 100) / 100,
      draft_hours:        Math.round(d.draft_hours        * 100) / 100,
    }));

    return ResponseHelper.success(res, { period: { from, to }, daily });
  }

  // POST /api/time/entries/bulk-submit
  async bulkSubmit(req, res) {
    const { entry_ids } = req.body;
    if (!Array.isArray(entry_ids) || entry_ids.length === 0) return ResponseHelper.validationError(res, 'entry_ids array is required');

    const results = { submitted: [], failed: [] };
    for (const id of entry_ids) {
      const entry = await this.db.findById(TABLES.TIME_ENTRIES, id, req.tenantId);
      if (!entry || String(entry.user_id) !== req.currentUser.id || entry.status !== TIME_STATUS.DRAFT) {
        results.failed.push({ id, reason: 'Not found or not in DRAFT' });
      } else {
        await this.db.update(TABLES.TIME_ENTRIES, { ROWID: id, status: TIME_STATUS.SUBMITTED, submitted_at: DataStoreService.fmtDT(new Date()) });
        results.submitted.push(id);
      }
    }
    return ResponseHelper.success(res, results);
  }

  // Returns true if userId is a designated team lead (teams.lead_user_id) or
  // holds a lead-level role in team_members.
  async _isTeamLead(tenantId, userId) {
    const self = String(userId);
    const tid  = String(tenantId);
    const ledTeams = await this.db.findWhere(
      TABLES.TEAMS, tid, `lead_user_id = '${self}'`, { limit: 1 }
    );
    if (ledTeams && ledTeams.length > 0) return true;
    const LEAD_ROLES = new Set(['DELIVERY_LEAD', 'LEAD', 'TECH_LEAD', 'SCRUM_MASTER', 'PROJECT_MANAGER']);
    const memberRows = await this.db.findWhere(
      TABLES.TEAM_MEMBERS, tid, `user_id = '${self}'`, { limit: 200 }
    );
    return memberRows.some(m => LEAD_ROLES.has(m.role));
  }
}

// ─── Email helpers ───────────────────────────────────────────────────────────
// Same formatting helpers used in ApprovalController; kept locally so this
// controller has no cross-controller dependency.

function _formatHours(raw) {
  const n = parseFloat(raw);
  if (!isFinite(n) || n <= 0) return '0 min';
  const totalMin = Math.round(n * 60);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} ${h === 1 ? 'hour' : 'hours'}`;
  return `${h} h ${m} min`;
}

function _formatDate(raw) {
  if (!raw) return '';
  const datePart = String(raw).slice(0, 10);
  const d = new Date(datePart + 'T00:00:00Z');
  if (isNaN(d.getTime())) return String(raw);
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${d.getUTCDate()} ${months[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

function _escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Polished email sent TO the approver when someone submits a time entry that
// needs their review. Structured greeting, summary table, clear call to
// action, and a brand signature — matches the rest of the OpsPulse mail look.
function _pendingApprovalEmailHtml({ approverName, submitterName, hoursLabel, dateLabel, description, timeEntryId, tenantSlug }) {
  // Resolve the env-specific app URL; falls back to the dev origin so the
  // function still renders something usable when APP_URL isn't configured.
  const APP_URL = (process.env.APP_URL || 'https://delivery-sync-60040289923.development.catalystserverless.in').replace(/\/$/, '');
  // Deep link: /app/#/<tenantSlug>/time-tracking?approvalId=<id>. The page
  // can read the param and scroll/open the Approvals tab to that row.
  const slug    = tenantSlug ? `/${String(tenantSlug).replace(/^\/+|\/+$/g, '')}` : '';
  const route   = timeEntryId
    ? `/time-tracking?approvalId=${encodeURIComponent(timeEntryId)}`
    : `/time-tracking`;
  const ctaUrl  = `${APP_URL}/app/#${slug}${route}`;

  return `
  <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1f2937;">
    <p style="margin:0 0 16px;font-size:15px;">Hi ${_escapeHtml(approverName || 'there')},</p>

    <p style="margin:0 0 18px;font-size:14px;line-height:1.55;">
      <strong>${_escapeHtml(submitterName || 'A team member')}</strong> has submitted a time entry that needs your approval.
    </p>

    <table cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;width:100%;margin-bottom:20px;">
      <tr>
        <td style="padding:10px 14px;font-size:12px;color:#6b7280;width:90px;border-bottom:1px solid #e5e7eb;">Submitted by</td>
        <td style="padding:10px 14px;font-size:13px;color:#111827;font-weight:600;border-bottom:1px solid #e5e7eb;">${_escapeHtml(submitterName || '—')}</td>
      </tr>
      <tr>
        <td style="padding:10px 14px;font-size:12px;color:#6b7280;border-bottom:1px solid #e5e7eb;">Hours</td>
        <td style="padding:10px 14px;font-size:13px;color:#111827;font-weight:600;border-bottom:1px solid #e5e7eb;">${_escapeHtml(hoursLabel)}</td>
      </tr>
      <tr>
        <td style="padding:10px 14px;font-size:12px;color:#6b7280;${description ? 'border-bottom:1px solid #e5e7eb;' : ''}">Date</td>
        <td style="padding:10px 14px;font-size:13px;color:#111827;font-weight:600;${description ? 'border-bottom:1px solid #e5e7eb;' : ''}">${_escapeHtml(dateLabel)}</td>
      </tr>
      ${description ? `
      <tr>
        <td style="padding:10px 14px;font-size:12px;color:#6b7280;vertical-align:top;">Description</td>
        <td style="padding:10px 14px;font-size:13px;color:#374151;">${_escapeHtml(description)}</td>
      </tr>` : ''}
    </table>

    <div style="text-align:center;margin:24px 0 16px;">
      <a href="${ctaUrl}" style="display:inline-block;background:linear-gradient(135deg,#4f46e5 0%,#7c3aed 100%);color:#ffffff;font-size:14px;font-weight:600;padding:12px 28px;border-radius:8px;text-decoration:none;letter-spacing:0.2px;">
        Review &amp; Approve &nbsp;&rarr;
      </a>
      <div style="font-size:11px;color:#9ca3af;margin-top:8px;">
        Or paste this link:&nbsp;<a href="${ctaUrl}" style="color:#4f46e5;text-decoration:none;word-break:break-all;">${ctaUrl}</a>
      </div>
    </div>

    <p style="margin:24px 0 4px;font-size:13px;color:#374151;">Regards,</p>
    <p style="margin:0;font-size:13px;color:#4f46e5;font-weight:600;">DSV OpsPulse team</p>
  </div>`;
}

module.exports = TimeController;
