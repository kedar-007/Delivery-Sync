'use strict';

const DataStoreService = require('../services/DataStoreService');
const AuditService = require('../services/AuditService');
const NotificationService = require('../services/NotificationService');
const ResponseHelper = require('../utils/ResponseHelper');
const Validator = require('../utils/Validator');
const { TABLES, BLOCKER_STATUS, AUDIT_ACTION, NOTIFICATION_TYPE } = require('../utils/Constants');

/**
 * BlockerController – manage blockers with escalation capability.
 */
class BlockerController {
  constructor(catalystApp) {
    this.db = new DataStoreService(catalystApp);
    this.audit = new AuditService(this.db);
    this.notifier = new NotificationService(catalystApp, this.db);
  }

  /**
   * POST /api/blockers
   */
  async createBlocker(req, res) {
    try {
      const { tenantId, id: userId } = req.currentUser;
      const data = Validator.validateCreateBlocker(req.body);

      const project = await this.db.findById(TABLES.PROJECTS, data.project_id, tenantId);
      if (!project) return ResponseHelper.notFound(res, 'Project not found');

      const insertPayload = {
        tenant_id: tenantId,
        project_id: data.project_id,
        title: data.title,
        severity: data.severity,
        status: BLOCKER_STATUS.OPEN,
      };
      // Only include optional columns when they have a real value to avoid
      // "Invalid input value for column" errors if columns don't exist in table
      if (data.description) insertPayload.description = data.description;
      if (data.owner_user_id) insertPayload.owner_user_id = data.owner_user_id;
      if (userId) insertPayload.raised_by = userId;

      const blocker = await this.db.insert(TABLES.BLOCKERS, insertPayload);

      await this.audit.log({
        tenantId, entityType: 'blocker', entityId: String(blocker.ROWID),
        action: AUDIT_ACTION.CREATE,
        newValue: { title: data.title, severity: data.severity },
        performedBy: userId,
      });

      // Notify project LEAD members about new blocker (fire-and-forget)
      this._notifyLeadsOfNewBlocker({
        tenantId, projectId: data.project_id, project,
        blockerId: String(blocker.ROWID), title: data.title,
        severity: data.severity, raisedByUserId: userId,
      }).catch((e) => console.error('[BlockerController] notify leads failed:', e.message));

      return ResponseHelper.created(res, {
        blocker: {
          id: String(blocker.ROWID), projectId: data.project_id,
          title: data.title, severity: data.severity,
          status: BLOCKER_STATUS.OPEN, ownerUserId: data.owner_user_id,
        },
      });
    } catch (err) {
      if (err.isValidation) return ResponseHelper.validationError(res, err.message, err.details);
      return ResponseHelper.serverError(res, err.message);
    }
  }

  /**
   * GET /api/blockers?projectId=&status=&severity=
   */
  async listBlockers(req, res) {
    try {
      const { tenantId } = req.currentUser;
      const { projectId, status, severity } = req.query;

      const conditions = [];
      if (projectId) conditions.push(`project_id = '${DataStoreService.escape(projectId)}'`);
      if (status) conditions.push(`status = '${DataStoreService.escape(status)}'`);
      if (severity) conditions.push(`severity = '${DataStoreService.escape(severity)}'`);

      const blockers = await this.db.findWhere(
        TABLES.BLOCKERS, tenantId,
        conditions.length > 0 ? conditions.join(' AND ') : null,
        { orderBy: 'CREATEDTIME DESC', limit: 100 }
      );

      const today = DataStoreService.today();
      return ResponseHelper.success(res, {
        blockers: blockers.map((b) => {
          const createdDate = b.raised_date || today;
          const ageDays = Math.floor((new Date(today) - new Date(createdDate)) / 86400000);
          return {
            id: String(b.ROWID),
            projectId: b.project_id,
            title: b.title,
            description: b.description,
            severity: b.severity,
            status: b.status,
            ownerUserId: b.owner_user_id,
            raisedBy: b.raised_by,
            resolution: b.resolution,
            resolvedDate: b.resolved_date,
            escalatedTo: b.escalated_to,
            ageDays,
          };
        }),
      });
    } catch (err) {
      return ResponseHelper.serverError(res, err.message);
    }
  }

  /**
   * PUT /api/blockers/:blockerId
   */
  async updateBlocker(req, res) {
    try {
      const { tenantId, id: userId } = req.currentUser;
      const { blockerId } = req.params;

      const existing = await this.db.findById(TABLES.BLOCKERS, blockerId, tenantId);
      if (!existing) return ResponseHelper.notFound(res, 'Blocker not found');

      const data = Validator.validateUpdateBlocker(req.body);
      const updatePayload = { ROWID: blockerId };
      if (data.title !== undefined) updatePayload.title = data.title;
      if (data.description !== undefined) updatePayload.description = data.description;
      if (data.severity !== undefined) updatePayload.severity = data.severity;
      if (data.status !== undefined) updatePayload.status = data.status;
      if (data.resolution !== undefined) updatePayload.resolution = data.resolution;
      if (data.escalated_to !== undefined) updatePayload.escalated_to = data.escalated_to;

      if (data.status === BLOCKER_STATUS.RESOLVED && existing.status !== BLOCKER_STATUS.RESOLVED) {
        updatePayload.resolved_date = DataStoreService.today();
      }

      await this.db.update(TABLES.BLOCKERS, updatePayload);

      if (data.status && data.status !== existing.status) {
        await this.audit.log({
          tenantId, entityType: 'blocker', entityId: blockerId,
          action: data.status === BLOCKER_STATUS.ESCALATED ? AUDIT_ACTION.ESCALATE : AUDIT_ACTION.STATUS_CHANGE,
          oldValue: { status: existing.status },
          newValue: { status: data.status, resolution: data.resolution },
          performedBy: userId,
        });

        // Notify owner when blocker is resolved via update
        if (data.status === BLOCKER_STATUS.RESOLVED && existing.raised_by) {
          this._notifyBlockerOwnerResolved({
            tenantId, blockerId,
            blockerTitle: data.title || existing.title,
            resolution: data.resolution || '',
            raisedByUserId: existing.raised_by,
            resolvedByUserId: userId,
            projectId: existing.project_id,
          }).catch((e) => console.error('[BlockerController] resolve notify failed:', e.message));
        }
      }

      return ResponseHelper.success(res, { blockerId, updated: data });
    } catch (err) {
      if (err.isValidation) return ResponseHelper.validationError(res, err.message, err.details);
      return ResponseHelper.serverError(res, err.message);
    }
  }

  /**
   * PATCH /api/blockers/:blockerId/resolve
   */
  async resolveBlocker(req, res) {
    try {
      const { tenantId, id: userId } = req.currentUser;
      const { blockerId } = req.params;
      const { resolution } = req.body;

      const existing = await this.db.findById(TABLES.BLOCKERS, blockerId, tenantId);
      if (!existing) return ResponseHelper.notFound(res, 'Blocker not found');
      if (existing.status === BLOCKER_STATUS.RESOLVED) {
        return ResponseHelper.conflict(res, 'Blocker is already resolved');
      }

      await this.db.update(TABLES.BLOCKERS, {
        ROWID: blockerId,
        status: BLOCKER_STATUS.RESOLVED,
        resolution: resolution || '',
        resolved_date: DataStoreService.today(),
      });

      await this.audit.log({
        tenantId, entityType: 'blocker', entityId: blockerId,
        action: AUDIT_ACTION.STATUS_CHANGE,
        oldValue: { status: existing.status },
        newValue: { status: BLOCKER_STATUS.RESOLVED, resolution },
        performedBy: userId,
      });

      // Notify the person who raised the blocker
      if (existing.raised_by) {
        this._notifyBlockerOwnerResolved({
          tenantId, blockerId,
          blockerTitle: existing.title,
          resolution: resolution || '',
          raisedByUserId: existing.raised_by,
          resolvedByUserId: userId,
          projectId: existing.project_id,
        }).catch((e) => console.error('[BlockerController] resolve notify failed:', e.message));
      }

      return ResponseHelper.success(res, null, 'Blocker resolved');
    } catch (err) {
      return ResponseHelper.serverError(res, err.message);
    }
  }

  // ─── Private Helpers ─────────────────────────────────────────────────────────

  async _notifyLeadsOfNewBlocker({ tenantId, projectId, project, blockerId, title, severity, raisedByUserId }) {
    console.log(`[BlockerNotify] projectId=${projectId} raisedByUserId=${raisedByUserId}`);

    const leads = await this.db.findWhere(
      TABLES.PROJECT_MEMBERS, tenantId,
      `project_id = '${projectId}' AND role IN ('DELIVERY_LEAD','PROJECT_MANAGER','TECH_LEAD','SCRUM_MASTER','PRODUCT_OWNER','LEAD')`,
      { limit: 20 }
    );
    console.log(`[BlockerNotify] project_members rows found: ${leads.length}`, leads.map((l) => ({ user_id: l.user_id, role: l.role })));

    if (leads.length === 0) {
      await this.audit.log({
        tenantId,
        entityType: 'notification',
        entityId: blockerId,
        action: AUDIT_ACTION.NOTIFY_SKIPPED,
        newValue: { channel: 'email', event: 'BLOCKER_RAISED', reason: 'no_leads_found_in_project_members', projectId },
        performedBy: raisedByUserId,
      });
      return;
    }

    const raiser = await this.db.findById(TABLES.USERS, raisedByUserId, tenantId);
    const raisedByName = raiser?.name || 'A team member';

    // Enrich leads with user details for email
    const leadUserIds = leads
      .filter((l) => String(l.user_id) !== String(raisedByUserId))
      .map((l) => `'${l.user_id}'`);

    console.log(`[BlockerNotify] leadUserIds to enrich (excluding raiser): ${leadUserIds.join(', ') || 'none'}`);

    let leadUserMap = {};
    if (leadUserIds.length > 0) {
      const users = await this.db.query(
        `SELECT * FROM ${TABLES.USERS} WHERE ROWID IN (${leadUserIds.join(',')}) LIMIT 20`
      );
      console.log(`[BlockerNotify] users fetched: ${users.length}`, users.map((u) => ({ id: u.ROWID, name: u.name, email: u.email })));
      users.forEach((u) => { leadUserMap[String(u.ROWID)] = u; });
    }

    for (const lead of leads) {
      if (String(lead.user_id) === String(raisedByUserId)) continue;

      const leadUser = leadUserMap[String(lead.user_id)];
      console.log(`[BlockerNotify] lead user_id=${lead.user_id} role=${lead.role} → name=${leadUser?.name} email=${leadUser?.email} hasEmail=${!!leadUser?.email}`);
      await Promise.all([
        this.notifier.sendInApp({
          tenantId,
          userId: lead.user_id,
          title: `New ${severity} blocker on ${project.name}`,
          message: `${raisedByName} raised a blocker: "${title}"`,
          type: NOTIFICATION_TYPE.BLOCKER_ADDED,
          entityType: 'blocker',
          entityId: blockerId,
          metadata: { projectId, severity, raisedBy: raisedByName },
        }),
        leadUser?.email
          ? this.notifier.sendBlockerAdded({
              tenantId,
              userId: lead.user_id,
              toEmail: leadUser.email,
              toName: leadUser.name || leadUser.email,
              blockerTitle: title,
              severity,
              projectName: project.name,
              raisedBy: raisedByName,
            })
          : Promise.resolve(null),
      ]).then(async ([, emailResult]) => {
        const noEmail = !leadUser?.email;
        console.log(`[BlockerNotify] lead ${lead.user_id} email=${leadUser?.email} result=${emailResult}`);
        await this.audit.log({
          tenantId,
          entityType: 'notification',
          entityId: blockerId,
          action: noEmail
            ? AUDIT_ACTION.NOTIFY_SKIPPED
            : emailResult
              ? AUDIT_ACTION.NOTIFY_SENT
              : AUDIT_ACTION.NOTIFY_FAILED,
          newValue: {
            channel: 'email',
            event: 'BLOCKER_RAISED',
            toUserId: String(lead.user_id),
            toEmail: leadUser?.email || null,
            toName: leadUser?.name || null,
            severity,
            reason: noEmail ? 'no_email_on_user' : (emailResult ? 'ok' : 'send_failed'),
          },
          performedBy: raisedByUserId,
        });
      }).catch((e) => console.error(`[BlockerNotify] audit/email error for lead ${lead.user_id}:`, e.message));
    }
  }
  async _notifyBlockerOwnerResolved({ tenantId, blockerId, blockerTitle, resolution, raisedByUserId, resolvedByUserId, projectId }) {
    console.log(`[BlockerResolvedNotify] blockerId=${blockerId} raisedBy=${raisedByUserId} resolvedBy=${resolvedByUserId}`);

    const [owner, resolver, project] = await Promise.all([
      this.db.findById(TABLES.USERS, raisedByUserId, tenantId),
      this.db.findById(TABLES.USERS, resolvedByUserId, tenantId),
      this.db.findById(TABLES.PROJECTS, projectId, tenantId),
    ]);

    console.log(`[BlockerResolvedNotify] owner=${owner?.name} email=${owner?.email} | resolver=${resolver?.name}`);

    if (!owner) return;

    const resolverName = resolver?.name || 'A project lead';
    const projectName = project?.name || '';

    const [, emailResult] = await Promise.all([
      this.notifier.sendInApp({
        tenantId,
        userId: raisedByUserId,
        title: `Your blocker "${blockerTitle}" has been resolved`,
        message: `${resolverName} resolved your blocker on "${projectName}".${resolution ? ' Resolution: ' + resolution : ''}`,
        type: NOTIFICATION_TYPE.BLOCKER_ADDED,
        entityType: 'blocker',
        entityId: blockerId,
        metadata: { projectId, resolution, resolvedBy: resolverName },
      }),
      owner.email
        ? this.notifier.sendBlockerResolved({
            toEmail: owner.email,
            toName: owner.name || owner.email,
            blockerTitle,
            projectName,
            resolvedBy: resolverName,
            resolution,
          })
        : Promise.resolve(null),
    ]);

    await this.audit.log({
      tenantId,
      entityType: 'notification',
      entityId: blockerId,
      action: !owner.email
        ? AUDIT_ACTION.NOTIFY_SKIPPED
        : emailResult ? AUDIT_ACTION.NOTIFY_SENT : AUDIT_ACTION.NOTIFY_FAILED,
      newValue: {
        channel: 'email', event: 'BLOCKER_RESOLVED',
        toUserId: String(raisedByUserId), toEmail: owner.email || null,
        reason: !owner.email ? 'no_email_on_user' : (emailResult ? 'ok' : 'send_failed'),
      },
      performedBy: resolvedByUserId,
    });
  }
}

module.exports = BlockerController;
