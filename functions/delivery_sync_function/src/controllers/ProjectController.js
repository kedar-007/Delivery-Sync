'use strict';

const DataStoreService = require('../services/DataStoreService');
const AuditService = require('../services/AuditService');
const ResponseHelper = require('../utils/ResponseHelper');
const Validator = require('../utils/Validator');
const { TABLES, AUDIT_ACTION, PROJECT_STATUS } = require('../utils/Constants');

/**
 * ProjectController – full CRUD for projects including RAG management.
 */
class ProjectController {
  constructor(catalystApp) {
    this.db = new DataStoreService(catalystApp);
    this.audit = new AuditService(this.db);
  }

  /**
   * POST /api/projects
   */
  async createProject(req, res) {
    try {
      const data = Validator.validateCreateProject(req.body);
      const { tenantId, id: userId } = req.currentUser;

      const ownerUserId = data.owner_user_id || userId;

      const project = await this.db.insert(TABLES.PROJECTS, {
        tenant_id: tenantId,
        name: data.name,
        description: data.description,
        start_date: data.start_date,
        end_date: data.end_date,
        rag_status: data.rag_status,
        status: PROJECT_STATUS.ACTIVE,
        owner_user_id: ownerUserId,
        created_by: userId,
      });

      const projectId = String(project.ROWID);

      // Auto-add creator as project DELIVERY_LEAD
      await this.db.insert(TABLES.PROJECT_MEMBERS, {
        tenant_id: tenantId,
        project_id: projectId,
        user_id: userId,
        role: 'DELIVERY_LEAD',
        joined_date: DataStoreService.today(),
      });

      // If a separate owner is specified, add them as DELIVERY_LEAD (gives TASK_WRITE permission)
      if (data.owner_user_id && data.owner_user_id !== userId) {
        const ownerExists = await this.db.query(
          `SELECT ROWID FROM ${TABLES.PROJECT_MEMBERS} WHERE tenant_id = '${tenantId}' ` +
          `AND project_id = '${projectId}' AND user_id = '${DataStoreService.escape(data.owner_user_id)}' LIMIT 1`
        );
        if (ownerExists.length === 0) {
          await this.db.insert(TABLES.PROJECT_MEMBERS, {
            tenant_id: tenantId,
            project_id: projectId,
            user_id: data.owner_user_id,
            role: 'DELIVERY_LEAD',
            joined_date: DataStoreService.today(),
          });
        }
      }

      await this.audit.log({
        tenantId, entityType: 'project', entityId: projectId,
        action: AUDIT_ACTION.CREATE,
        newValue: { name: data.name, rag_status: data.rag_status },
        performedBy: userId,
      });

      return ResponseHelper.created(res, { project: { id: projectId, ...data } });
    } catch (err) {
      if (err.isValidation) return ResponseHelper.validationError(res, err.message, err.details);
      return ResponseHelper.serverError(res, err.message);
    }
  }

  /**
   * GET /api/projects?page=1&pageSize=20&status=
   */
  async getProjects(req, res) {
    try {
      const { tenantId, id: userId, role } = req.currentUser;
      const { page, pageSize, status } = req.query;

      let paged;
      const statusClause = status ? `status = '${DataStoreService.escape(status)}'` : null;

      // Only grant org-wide project visibility to TENANT_ADMIN unconditionally.
      // All other roles rely on their dataScope from org sharing rules — if no rule is set,
      // dataScope is null and they fall through to the membership-based filter below.
      const hasOrgWideAccess = role === 'TENANT_ADMIN'
        || req.currentUser.dataScope === 'ORG_WIDE'
        || req.currentUser.dataScope === 'SUBORDINATES';

      if (hasOrgWideAccess) {
        paged = await this.db.findPaginated(
          TABLES.PROJECTS, tenantId, statusClause,
          { orderBy: 'CREATEDTIME DESC', page, pageSize }
        );
      } else {
        // Get all membership IDs (these are typically small — one user won't be in 200+ projects)
        const memberships = await this.db.findAll(TABLES.PROJECT_MEMBERS,
          { tenant_id: tenantId, user_id: userId }, { limit: 200 });
        if (memberships.length === 0) {
          return ResponseHelper.success(res, { projects: [], total: 0, page: 1, pageSize: 20, totalPages: 1 });
        }
        const ids = memberships.map((m) => `'${m.project_id}'`).join(',');
        const extraWhere = statusClause
          ? `ROWID IN (${ids}) AND ${statusClause}`
          : `ROWID IN (${ids})`;
        paged = await this.db.findPaginated(
          TABLES.PROJECTS, tenantId, extraWhere,
          { orderBy: 'CREATEDTIME DESC', page, pageSize }
        );
      }

      return ResponseHelper.success(res, {
        projects: paged.rows.map((p) => ({
          id: String(p.ROWID),
          name: p.name,
          description: p.description,
          ragStatus: p.rag_status,
          status: p.status,
          startDate: p.start_date,
          endDate: p.end_date,
          ownerUserId: p.owner_user_id,
        })),
        total: paged.total,
        page: paged.page,
        pageSize: paged.pageSize,
        totalPages: paged.totalPages,
      });
    } catch (err) {
      return ResponseHelper.serverError(res, err.message);
    }
  }

  /**
   * GET /api/projects/:projectId
   */
  async getProjectDetails(req, res) {
    try {
      const { tenantId } = req.currentUser;
      const { projectId } = req.params;

      const project = await this.db.findById(TABLES.PROJECTS, projectId, tenantId);
      if (!project) return ResponseHelper.notFound(res, 'Project not found');

      // Fetch member count
      const members = await this.db.findAll(TABLES.PROJECT_MEMBERS,
        { tenant_id: tenantId, project_id: projectId }, { limit: 100 });

      return ResponseHelper.success(res, {
        project: {
          id: String(project.ROWID),
          name: project.name,
          description: project.description,
          ragStatus: project.rag_status,
          status: project.status,
          startDate: project.start_date,
          endDate: project.end_date,
          ownerUserId: project.owner_user_id,
          createdBy: project.created_by,
          memberCount: members.length,
        },
      });
    } catch (err) {
      return ResponseHelper.serverError(res, err.message);
    }
  }

  /**
   * PUT /api/projects/:projectId
   */
  async updateProject(req, res) {
    try {
      const { tenantId, id: userId } = req.currentUser;
      const { projectId } = req.params;

      const existing = await this.db.findById(TABLES.PROJECTS, projectId, tenantId);
      if (!existing) return ResponseHelper.notFound(res, 'Project not found');

      const data = Validator.validateUpdateProject(req.body);
      const updatePayload = { ROWID: projectId };
      if (data.name !== undefined) updatePayload.name = data.name;
      if (data.description !== undefined) updatePayload.description = data.description;
      if (data.start_date !== undefined) updatePayload.start_date = data.start_date;
      if (data.end_date !== undefined) updatePayload.end_date = data.end_date;
      if (data.status !== undefined) updatePayload.status = data.status;

      const updated = await this.db.update(TABLES.PROJECTS, updatePayload);

      await this.audit.log({
        tenantId, entityType: 'project', entityId: projectId,
        action: AUDIT_ACTION.UPDATE,
        oldValue: { name: existing.name, status: existing.status },
        newValue: data,
        performedBy: userId,
      });

      return ResponseHelper.success(res, { project: { id: projectId, ...data } });
    } catch (err) {
      if (err.isValidation) return ResponseHelper.validationError(res, err.message, err.details);
      return ResponseHelper.serverError(res, err.message);
    }
  }

  /**
   * PATCH /api/projects/:projectId/rag
   * Update RAG status with mandatory reason and audit trail.
   */
  async updateProjectRAG(req, res) {
    try {
      const { tenantId, id: userId } = req.currentUser;
      const { projectId } = req.params;

      const existing = await this.db.findById(TABLES.PROJECTS, projectId, tenantId);
      if (!existing) return ResponseHelper.notFound(res, 'Project not found');

      const data = Validator.validateUpdateRAG(req.body);
      const oldRag = existing.rag_status;

      await this.db.update(TABLES.PROJECTS, {
        ROWID: projectId,
        rag_status: data.rag_status,
      });

      await this.audit.log({
        tenantId, entityType: 'project', entityId: projectId,
        action: AUDIT_ACTION.RAG_CHANGE,
        oldValue: { rag_status: oldRag },
        newValue: { rag_status: data.rag_status, reason: data.reason },
        performedBy: userId,
      });

      return ResponseHelper.success(res, {
        projectId,
        ragStatus: data.rag_status,
        previousRagStatus: oldRag,
        reason: data.reason,
      }, `RAG status updated to ${data.rag_status}`);
    } catch (err) {
      if (err.isValidation) return ResponseHelper.validationError(res, err.message, err.details);
      return ResponseHelper.serverError(res, err.message);
    }
  }

  /**
   * GET /api/projects/:projectId/milestones
   */
  async getMilestones(req, res) {
    try {
      const { tenantId } = req.currentUser;
      const { projectId } = req.params;

      const milestones = await this.db.findAll(TABLES.MILESTONES,
        { tenant_id: tenantId, project_id: projectId },
        { orderBy: 'due_date ASC', limit: 100 });

      return ResponseHelper.success(res, {
        milestones: milestones.map((m) => ({
          id: String(m.ROWID), title: m.title, description: m.description,
          dueDate: m.due_date, status: m.status,
        })),
      });
    } catch (err) {
      return ResponseHelper.serverError(res, err.message);
    }
  }

  /**
   * POST /api/projects/:projectId/milestones
   */
  async createMilestone(req, res) {
    try {
      const { tenantId, id: userId } = req.currentUser;
      const { projectId } = req.params;

      const data = Validator.validateCreateMilestone(req.body);
      const project = await this.db.findById(TABLES.PROJECTS, projectId, tenantId);
      if (!project) return ResponseHelper.notFound(res, 'Project not found');

      const milestone = await this.db.insert(TABLES.MILESTONES, {
        tenant_id: tenantId,
        project_id: projectId,
        title: data.title,
        description: data.description,
        due_date: data.due_date,
        status: 'PENDING',
        created_by: userId,
      });

      await this.audit.log({
        tenantId, entityType: 'milestone', entityId: String(milestone.ROWID),
        action: AUDIT_ACTION.CREATE,
        newValue: { title: data.title, due_date: data.due_date },
        performedBy: userId,
      });

      return ResponseHelper.created(res, {
        milestone: { id: String(milestone.ROWID), ...data, status: 'PENDING' },
      });
    } catch (err) {
      if (err.isValidation) return ResponseHelper.validationError(res, err.message, err.details);
      return ResponseHelper.serverError(res, err.message);
    }
  }

  /**
   * PUT /api/projects/:projectId/milestones/:milestoneId
   */
  async updateMilestone(req, res) {
    try {
      const { tenantId, id: userId } = req.currentUser;
      const { projectId, milestoneId } = req.params;

      const existing = await this.db.findById(TABLES.MILESTONES, milestoneId, tenantId);
      if (!existing || String(existing.project_id) !== projectId) {
        return ResponseHelper.notFound(res, 'Milestone not found');
      }

      const data = Validator.validateUpdateMilestone(req.body);
      const updatePayload = { ROWID: milestoneId };
      if (data.title !== undefined) updatePayload.title = data.title;
      if (data.description !== undefined) updatePayload.description = data.description;
      if (data.due_date !== undefined) updatePayload.due_date = data.due_date;
      if (data.status !== undefined) updatePayload.status = data.status;
      if (data.owner_user_id !== undefined) updatePayload.owner_user_id = data.owner_user_id;

      await this.db.update(TABLES.MILESTONES, updatePayload);

      await this.audit.log({
        tenantId, entityType: 'milestone', entityId: milestoneId,
        action: AUDIT_ACTION.UPDATE,
        oldValue: { status: existing.status, due_date: existing.due_date },
        newValue: data,
        performedBy: userId,
      });

      return ResponseHelper.success(res, { milestoneId, updated: data });
    } catch (err) {
      if (err.isValidation) return ResponseHelper.validationError(res, err.message, err.details);
      return ResponseHelper.serverError(res, err.message);
    }
  }
}

module.exports = ProjectController;
