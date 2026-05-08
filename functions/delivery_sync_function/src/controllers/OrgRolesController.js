'use strict';

const DataStoreService = require('../services/DataStoreService');
const AuditService = require('../services/AuditService');
const ResponseHelper = require('../utils/ResponseHelper');
const { TABLES, AUDIT_ACTION, PERMISSIONS } = require('../utils/Constants');

// All permission keys available for assignment to org roles
const ALL_PERMISSION_KEYS = Object.values(PERMISSIONS).filter((p) => p !== 'DATA_SEED');

// ── Colour palette for auto-assignment when none provided ──────────────────────
const DEFAULT_COLORS = [
  '#4F46E5', '#7C3AED', '#0EA5E9', '#10B981', '#F59E0B',
  '#EF4444', '#EC4899', '#8B5CF6', '#14B8A6', '#F97316',
];

/**
 * OrgRolesController
 *
 * Manages the org-chart role hierarchy (custom roles independent of Catalyst
 * system roles), their permission sets, and user assignments.
 *
 * Tables:
 *   org_roles            – role definitions (name, color, level, parent_role_id)
 *   org_role_permissions – JSON array of permission keys per role
 *   user_org_roles       – user ↔ org role assignment (one active per user)
 */
class OrgRolesController {
  constructor(catalystApp) {
    this.db = new DataStoreService(catalystApp);
    this.audit = new AuditService(this.db);
  }

  // ── GET /api/admin/org-roles ───────────────────────────────────────────────

  async listRoles(req, res) {
    try {
      const { tenantId } = req.currentUser;

      const roles = await this._fetchRoles(tenantId);
      const permsMap = await this._fetchRolePermissionsMap(tenantId, roles.map((r) => String(r.ROWID)));
      const countMap = await this._fetchUserCountMap(tenantId);

      return ResponseHelper.success(res, {
        roles: roles.map((r) => this._formatRole(r, permsMap, countMap)),
      });
    } catch (err) {
      console.error('[OrgRolesController] listRoles:', err.message);
      return ResponseHelper.serverError(res, err.message);
    }
  }

  // ── POST /api/admin/org-roles ──────────────────────────────────────────────

  async createRole(req, res) {
    try {
      const { tenantId, id: performedBy } = req.currentUser;
      const { name, description = '', color, parentRoleId = null, level = 0, permissions = [] } = req.body;

      if (!name || !name.trim()) {
        return ResponseHelper.validationError(res, 'Role name is required');
      }

      // Duplicate name check
      const existing = await this.db.query(
        `SELECT ROWID FROM ${TABLES.ORG_ROLES} WHERE tenant_id = '${tenantId}' ` +
        `AND name = '${DataStoreService.escape(name.trim())}' AND is_active = 'true' LIMIT 1`
      );
      if (existing.length > 0) {
        return ResponseHelper.conflict(res, `A role named "${name.trim()}" already exists`);
      }

      const roleColor = color || DEFAULT_COLORS[Math.floor(Math.random() * DEFAULT_COLORS.length)];

      // Catalyst DataStore rejects null values in INSERT — omit optional fields when absent
      const insertPayload = {
        tenant_id: String(tenantId),
        name: name.trim(),
        description: description.trim(),
        color: roleColor,
        level: Number(level) || 0,
        is_active: 'true',
      };
      if (parentRoleId) insertPayload.parent_role_id = String(parentRoleId);

      const role = await this.db.insert(TABLES.ORG_ROLES, insertPayload);

      const roleId = String(role.ROWID);

      // Save permissions
      const cleanPerms = (permissions || []).filter((p) => ALL_PERMISSION_KEYS.includes(p));
      await this._upsertRolePermissions(tenantId, roleId, cleanPerms);

      await this.audit.log({
        tenantId, entityType: 'org_role', entityId: roleId,
        action: AUDIT_ACTION.CREATE,
        newValue: { name: name.trim(), color: roleColor, level, permissions: cleanPerms },
        performedBy,
      });

      return ResponseHelper.created(res, {
        role: {
          id: roleId,
          name: name.trim(),
          description: description.trim(),
          color: roleColor,
          parentRoleId: parentRoleId ? String(parentRoleId) : null,
          level: Number(level) || 0,
          permissions: cleanPerms,
          userCount: 0,
          isActive: true,
        },
      }, `Role "${name.trim()}" created`);
    } catch (err) {
      console.error('[OrgRolesController] createRole:', err.message);
      return ResponseHelper.serverError(res, err.message);
    }
  }

  // ── PUT /api/admin/org-roles/:roleId ──────────────────────────────────────

  async updateRole(req, res) {
    try {
      const { tenantId, id: performedBy } = req.currentUser;
      const { roleId } = req.params;
      const { name, description, color, parentRoleId, level } = req.body;

      const existing = await this.db.findById(TABLES.ORG_ROLES, roleId, tenantId);
      if (!existing || !existing.is_active) {
        return ResponseHelper.notFound(res, 'Role not found');
      }

      const updatePayload = { ROWID: roleId };
      if (name !== undefined) updatePayload.name = name.trim();
      if (description !== undefined) updatePayload.description = description.trim();
      if (color !== undefined) updatePayload.color = color;
      if (parentRoleId !== undefined) updatePayload.parent_role_id = parentRoleId ? String(parentRoleId) : null;
      if (level !== undefined) updatePayload.level = Number(level);

      await this.db.update(TABLES.ORG_ROLES, updatePayload);

      await this.audit.log({
        tenantId, entityType: 'org_role', entityId: roleId,
        action: AUDIT_ACTION.UPDATE,
        oldValue: { name: existing.name, color: existing.color },
        newValue: updatePayload,
        performedBy,
      });

      return ResponseHelper.success(res, { roleId }, 'Role updated');
    } catch (err) {
      console.error('[OrgRolesController] updateRole:', err.message);
      return ResponseHelper.serverError(res, err.message);
    }
  }

  // ── DELETE /api/admin/org-roles/:roleId ───────────────────────────────────

  async deleteRole(req, res) {
    try {
      const { tenantId, id: performedBy } = req.currentUser;
      const { roleId } = req.params;

      const existing = await this.db.findById(TABLES.ORG_ROLES, roleId, tenantId);
      if (!existing) return ResponseHelper.notFound(res, 'Role not found');

      // Soft-delete
      await this.db.update(TABLES.ORG_ROLES, { ROWID: roleId, is_active: 'false' });

      // Un-assign all users from this role
      const assignments = await this.db.query(
        `SELECT ROWID FROM ${TABLES.USER_ORG_ROLES} WHERE tenant_id = '${tenantId}' ` +
        `AND org_role_id = '${roleId}' AND is_active = 'true' LIMIT 300`
      );
      for (const a of assignments) {
        await this.db.update(TABLES.USER_ORG_ROLES, { ROWID: String(a.ROWID), is_active: false });
      }

      await this.audit.log({
        tenantId, entityType: 'org_role', entityId: roleId,
        action: AUDIT_ACTION.DELETE,
        oldValue: { name: existing.name },
        performedBy,
      });

      return ResponseHelper.success(res, null, 'Role deleted');
    } catch (err) {
      console.error('[OrgRolesController] deleteRole:', err.message);
      return ResponseHelper.serverError(res, err.message);
    }
  }

  // ── GET /api/admin/org-roles/:roleId/permissions ──────────────────────────

  async getRolePermissions(req, res) {
    try {
      const { tenantId } = req.currentUser;
      const { roleId } = req.params;

      const role = await this.db.findById(TABLES.ORG_ROLES, roleId, tenantId);
      if (!role) return ResponseHelper.notFound(res, 'Role not found');

      const { permissions, moduleAccess } = await this._loadRolePermissions(tenantId, roleId);

      return ResponseHelper.success(res, {
        roleId,
        roleName: role.name,
        permissions,
        moduleAccess,
        allPermissions: ALL_PERMISSION_KEYS,
      });
    } catch (err) {
      return ResponseHelper.serverError(res, err.message);
    }
  }

  // ── PUT /api/admin/org-roles/:roleId/permissions ──────────────────────────

  async setRolePermissions(req, res) {
    try {
      const { tenantId, id: performedBy } = req.currentUser;
      const { roleId } = req.params;
      const { permissions = [], moduleAccess = [] } = req.body;

      const role = await this.db.findById(TABLES.ORG_ROLES, roleId, tenantId);
      if (!role) return ResponseHelper.notFound(res, 'Role not found');

      const cleanPerms = permissions.filter((p) => ALL_PERMISSION_KEYS.includes(p));
      const cleanModuleAccess = Array.isArray(moduleAccess) ? moduleAccess.filter((m) => typeof m === 'string') : [];
      await this._upsertRolePermissions(tenantId, roleId, cleanPerms, cleanModuleAccess);

      await this.audit.log({
        tenantId, entityType: 'org_role_permissions', entityId: roleId,
        action: AUDIT_ACTION.UPDATE,
        newValue: { permissions: cleanPerms, moduleAccess: cleanModuleAccess },
        performedBy,
      });

      return ResponseHelper.success(res, { roleId, permissions: cleanPerms, moduleAccess: cleanModuleAccess });
    } catch (err) {
      return ResponseHelper.serverError(res, err.message);
    }
  }

  // ── PUT /api/admin/users/:userId/org-role ─────────────────────────────────

  async assignUserOrgRole(req, res) {
    try {
      const { tenantId, id: performedBy } = req.currentUser;
      const { userId } = req.params;
      const { orgRoleId } = req.body; // null to remove

      const user = await this.db.findById(TABLES.USERS, userId, tenantId);
      if (!user) return ResponseHelper.notFound(res, 'User not found');

      // Deactivate any existing assignment
      const existing = await this.db.query(
        `SELECT ROWID FROM ${TABLES.USER_ORG_ROLES} WHERE tenant_id = '${tenantId}' ` +
        `AND user_id = '${userId}' AND is_active = 'true' LIMIT 1`
      );
      if (existing.length > 0) {
        await this.db.update(TABLES.USER_ORG_ROLES, { ROWID: String(existing[0].ROWID), is_active: false });
      }

      if (orgRoleId) {
        const role = await this.db.findById(TABLES.ORG_ROLES, orgRoleId, tenantId);
        if (!role || !role.is_active) {
          return ResponseHelper.notFound(res, 'Org role not found');
        }

        await this.db.insert(TABLES.USER_ORG_ROLES, {
          tenant_id: String(tenantId),
          user_id: String(userId),
          org_role_id: String(orgRoleId),
          assigned_by: String(performedBy),
          is_active: 'true',
        });
      }

      await this.audit.log({
        tenantId, entityType: 'user_org_role', entityId: userId,
        action: AUDIT_ACTION.ASSIGN,
        newValue: { orgRoleId: orgRoleId || null },
        performedBy,
      });

      return ResponseHelper.success(res, { userId, orgRoleId: orgRoleId || null });
    } catch (err) {
      console.error('[OrgRolesController] assignUserOrgRole:', err.message);
      return ResponseHelper.serverError(res, err.message);
    }
  }

  // ── GET /api/admin/org-chart ──────────────────────────────────────────────

  async getOrgChart(req, res) {
    try {
      const { tenantId } = req.currentUser;

      const roles = await this._fetchRoles(tenantId);
      if (roles.length === 0) {
        return ResponseHelper.success(res, { nodes: [], edges: [] });
      }

      const roleIds = roles.map((r) => String(r.ROWID));
      const permsMap  = await this._fetchRolePermissionsMap(tenantId, roleIds);
      const usersMap  = await this._fetchUsersPerRole(roleIds);

      const nodes = roles.map((r) => {
        const users = usersMap[String(r.ROWID)] || [];
        return {
          id:           String(r.ROWID),
          name:         r.name,
          description:  r.description || '',
          color:        r.color || '#4F46E5',
          level:        Number(r.level) || 0,
          parentRoleId: r.parent_role_id ? String(r.parent_role_id) : null,
          permissions:  (permsMap[String(r.ROWID)] || {}).permissions || [],
          users,
          userCount:    users.length,
        };
      });

      const edges = nodes
        .filter((n) => n.parentRoleId)
        .map((n) => ({ from: n.parentRoleId, to: n.id }));

      return ResponseHelper.success(res, { nodes, edges });
    } catch (err) {
      console.error('[OrgRolesController] getOrgChart:', err.message);
      return ResponseHelper.serverError(res, err.message);
    }
  }

  // ── GET /api/admin/org-roles/:roleId/sharing ─────────────────────────────

  async getSharingRules(req, res) {
    try {
      const { tenantId } = req.currentUser;
      const { roleId } = req.params;
      const rules = await this.db.query(
        `SELECT ROWID, role_id, visibility_scope, target_role_id, access_level, record_types, is_active ` +
        `FROM ${TABLES.ORG_SHARING_RULES} WHERE tenant_id = '${tenantId}' ` +
        `AND role_id = '${roleId}' AND is_active = 'true' LIMIT 50`
      );
      return ResponseHelper.success(res, {
        rules: rules.map((r) => this._formatSharingRule(r)),
      });
    } catch (err) {
      console.error('[OrgRolesController] getSharingRules:', err.message);
      return ResponseHelper.serverError(res, err.message);
    }
  }

  // ── PUT /api/admin/org-roles/:roleId/sharing/visibility ───────────────────

  async setDefaultVisibility(req, res) {
    try {
      const { tenantId, id: performedBy } = req.currentUser;
      const { roleId } = req.params;
      const { visibilityScope, accessLevel = 'READ', recordTypes = ['ALL'] } = req.body;

      const VALID_SCOPES = ['OWN_DATA', 'ROLE_PEERS', 'SUBORDINATES', 'ORG_WIDE'];
      if (!VALID_SCOPES.includes(visibilityScope)) {
        return ResponseHelper.validationError(res, `visibilityScope must be one of: ${VALID_SCOPES.join(', ')}`);
      }

      // Delete all existing default rules for this role then insert the new one.
      // Soft-deactivate any we can't hard-delete so the new INSERT always wins.
      const existing = await this.db.query(
        `SELECT ROWID FROM ${TABLES.ORG_SHARING_RULES} WHERE tenant_id = '${tenantId}' ` +
        `AND role_id = '${roleId}' AND visibility_scope IN ('OWN_DATA','ROLE_PEERS','SUBORDINATES','ORG_WIDE') LIMIT 10`
      );
      for (const r of existing) {
        try {
          await this.db.delete(TABLES.ORG_SHARING_RULES, String(r.ROWID));
        } catch (_) {
          // Hard delete failed — soft-deactivate so it won't appear in queries
          try { await this.db.update(TABLES.ORG_SHARING_RULES, { ROWID: String(r.ROWID), is_active: false }); } catch (_) {}
        }
      }

      await this.db.insert(TABLES.ORG_SHARING_RULES, {
        tenant_id:        Number(tenantId),
        role_id:          String(roleId),
        visibility_scope: visibilityScope,
        access_level:     accessLevel,
        record_types:     JSON.stringify(recordTypes),
        is_active:        true,
      });

      await this.audit.log({
        tenantId, entityType: 'org_sharing_rule', entityId: roleId,
        action: AUDIT_ACTION.UPDATE,
        newValue: { visibilityScope, accessLevel, recordTypes },
        performedBy,
      });

      return ResponseHelper.success(res, { roleId, visibilityScope, accessLevel, recordTypes });
    } catch (err) {
      console.error('[OrgRolesController] setDefaultVisibility:', err.message);
      return ResponseHelper.serverError(res, err.message);
    }
  }

  // ── POST /api/admin/org-roles/:roleId/sharing/rules ───────────────────────

  async addExplicitRule(req, res) {
    try {
      const { tenantId } = req.currentUser;
      const { roleId } = req.params;
      const { targetRoleId, accessLevel = 'READ', recordTypes = ['ALL'] } = req.body;

      if (!targetRoleId) {
        return ResponseHelper.validationError(res, 'targetRoleId is required for explicit rules');
      }

      // Prevent duplicate explicit grants for the same role pair
      const duplicate = await this.db.query(
        `SELECT ROWID FROM ${TABLES.ORG_SHARING_RULES} WHERE tenant_id = '${tenantId}' ` +
        `AND role_id = '${roleId}' AND target_role_id = '${targetRoleId}' ` +
        `AND visibility_scope = 'EXPLICIT' AND is_active = 'true' LIMIT 1`
      );
      if (duplicate.length > 0) {
        return ResponseHelper.conflict(res, 'An explicit grant for this role pair already exists');
      }

      const row = await this.db.insert(TABLES.ORG_SHARING_RULES, {
        tenant_id:        Number(tenantId),
        role_id:          String(roleId),
        visibility_scope: 'EXPLICIT',
        target_role_id:   String(targetRoleId),
        access_level:     accessLevel,
        record_types:     JSON.stringify(recordTypes),
        is_active:        true,
      });

      return ResponseHelper.created(res, { rule: this._formatSharingRule(row) });
    } catch (err) {
      console.error('[OrgRolesController] addExplicitRule:', err.message);
      return ResponseHelper.serverError(res, err.message);
    }
  }

  // ── DELETE /api/admin/sharing-rules/:ruleId ───────────────────────────────

  async deleteRule(req, res) {
    try {
      const { tenantId } = req.currentUser;
      const { ruleId } = req.params;

      // Verify the rule belongs to this tenant before deleting (prevents cross-tenant deletion)
      const rule = await this.db.query(
        `SELECT ROWID FROM ${TABLES.ORG_SHARING_RULES} WHERE ROWID = '${ruleId}' AND tenant_id = '${tenantId}' LIMIT 1`
      );
      if (!rule.length) return ResponseHelper.notFound(res, 'Rule not found');

      await this.db.delete(TABLES.ORG_SHARING_RULES, String(ruleId));
      return ResponseHelper.success(res, { deleted: true });
    } catch (err) {
      console.error('[OrgRolesController] deleteRule:', err.message);
      return ResponseHelper.serverError(res, err.message);
    }
  }

  _formatSharingRule(r) {
    return {
      id:               String(r.ROWID),
      roleId:           String(r.role_id),
      visibilityScope:  r.visibility_scope,
      targetRoleId:     r.target_role_id ? String(r.target_role_id) : null,
      accessLevel:      r.access_level || 'READ',
      recordTypes:      (() => { try { return JSON.parse(r.record_types || '["ALL"]'); } catch { return ['ALL']; } })(),
      isActive:         r.is_active === true || r.is_active === 'true',
    };
  }

  // ── GET /api/admin/permissions/all ────────────────────────────────────────

  async listAllPermissions(_req, res) {
    // Group permissions by domain for easier UI rendering
    const groups = [
      { group: 'Projects & Sprints', keys: ['PROJECT_READ', 'PROJECT_WRITE', 'SPRINT_READ', 'SPRINT_WRITE', 'MILESTONE_READ', 'MILESTONE_WRITE'] },
      { group: 'Tasks', keys: ['TASK_READ', 'TASK_WRITE', 'TASK_ASSIGN', 'TASK_COMMENT_WRITE'] },
      { group: 'Standups & EOD', keys: ['STANDUP_READ', 'STANDUP_SUBMIT', 'EOD_READ', 'EOD_SUBMIT'] },
      { group: 'Actions & Blockers', keys: ['ACTION_READ', 'ACTION_WRITE', 'BLOCKER_READ', 'BLOCKER_WRITE'] },
      { group: 'RAID & Decisions', keys: ['RAID_READ', 'RAID_WRITE', 'DECISION_READ', 'DECISION_WRITE'] },
      { group: 'Time Tracking', keys: ['TIME_READ', 'TIME_WRITE', 'TIME_APPROVE', 'TIME_ANALYTICS'] },
      { group: 'Attendance', keys: ['ATTENDANCE_READ', 'ATTENDANCE_WRITE', 'ATTENDANCE_TEAM_VIEW', 'ATTENDANCE_ADMIN', 'IP_CONFIG_WRITE'] },
      { group: 'Leave', keys: ['LEAVE_READ', 'LEAVE_WRITE', 'LEAVE_APPROVE', 'LEAVE_ADMIN'] },
      { group: 'People & Org', keys: ['PROFILE_READ', 'PROFILE_WRITE', 'TEAM_READ', 'TEAM_WRITE', 'ORG_READ', 'ORG_WRITE', 'ORG_ROLE_READ', 'ORG_ROLE_WRITE', 'ANNOUNCEMENT_READ', 'ANNOUNCEMENT_WRITE'] },
      { group: 'Assets', keys: ['ASSET_READ', 'ASSET_WRITE', 'ASSET_ASSIGN', 'ASSET_APPROVE', 'ASSET_ADMIN'] },
      { group: 'Badges', keys: ['BADGE_READ', 'BADGE_WRITE', 'BADGE_AWARD'] },
      { group: 'Reports & Dashboard', keys: ['REPORT_READ', 'REPORT_WRITE', 'DASHBOARD_READ', 'CEO_DASHBOARD', 'CTO_DASHBOARD'] },
      { group: 'Notifications', keys: ['NOTIFICATION_READ'] },
      { group: 'Admin', keys: ['ADMIN_USERS', 'ADMIN_SETTINGS', 'INVITE_USER', 'CONFIG_READ', 'CONFIG_WRITE'] },
      { group: 'AI & Insights', keys: ['AI_INSIGHTS', 'AI_PERFORMANCE', 'AI_TEAM_ANALYSIS'] },
    ];

    return ResponseHelper.success(res, { groups, all: ALL_PERMISSION_KEYS });
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  async _fetchRoles(tenantId) {
    try {
      let rows = await this.db.query(
        `SELECT * FROM ${TABLES.ORG_ROLES} WHERE tenant_id = '${tenantId}' ORDER BY level ASC, ROWID ASC LIMIT 300`
      );
      // Recovery: old records were inserted with Number(tenantId) which rounds 17-digit IDs.
      // If nothing found with the exact string, try the Number()-rounded value.
      if (rows.length === 0) {
        const rounded = String(Number(tenantId));
        if (rounded !== tenantId) {
          rows = await this.db.query(
            `SELECT * FROM ${TABLES.ORG_ROLES} WHERE tenant_id = '${rounded}' ORDER BY level ASC, ROWID ASC LIMIT 300`
          );
        }
      }
      return rows.filter((r) => r.is_active !== false && r.is_active !== 'false' && r.is_active !== 0);
    } catch (err) {
      console.error('[OrgRolesController] _fetchRoles error:', err.message);
      return [];
    }
  }

  async _fetchRolePermissionsMap(tenantId, roleIds) {
    if (!roleIds.length) return {};
    try {
      const inClause = roleIds.map((id) => `'${id}'`).join(',');
      // No tenant_id filter — role IDs are already specific; avoids missing records
      // stored with Number()-rounded tenant_id
      const rows = await this.db.query(
        `SELECT org_role_id, permissions FROM ${TABLES.ORG_ROLE_PERMISSIONS} ` +
        `WHERE org_role_id IN (${inClause}) LIMIT 300`
      );
      const map = {};
      rows.forEach((r) => {
        const parsed = this._parsePermsColumn(r.permissions);
        map[String(r.org_role_id)] = parsed;
      });
      return map;
    } catch (_) { return {}; }
  }

  async _fetchUserCountMap(tenantId) {
    try {
      let rows = await this.db.query(
        `SELECT org_role_id FROM ${TABLES.USER_ORG_ROLES} WHERE tenant_id = '${tenantId}' AND is_active != 'false' LIMIT 300`
      );
      if (rows.length === 0) {
        const rounded = String(Number(tenantId));
        if (rounded !== tenantId) {
          rows = await this.db.query(
            `SELECT org_role_id FROM ${TABLES.USER_ORG_ROLES} WHERE tenant_id = '${rounded}' AND is_active != 'false' LIMIT 300`
          );
        }
      }
      const map = {};
      rows.forEach((r) => {
        const id = String(r.org_role_id);
        map[id] = (map[id] || 0) + 1;
      });
      return map;
    } catch (_) { return {}; }
  }

  async _fetchUsersPerRole(roleIds) {
    if (!roleIds.length) return {};
    try {
      const inClause = roleIds.map((id) => `'${id}'`).join(',');
      // No tenant_id filter — avoids precision-loss mismatch on records created with Number(tenantId)
      const assignments = await this.db.query(
        `SELECT user_id, org_role_id FROM ${TABLES.USER_ORG_ROLES} ` +
        `WHERE org_role_id IN (${inClause}) AND is_active != 'false' LIMIT 500`
      );
      if (!assignments.length) return {};

      const userIds = [...new Set(assignments.map((a) => String(a.user_id)))];
      const userInClause = userIds.map((id) => `'${id}'`).join(',');
      const users = await this.db.query(
        `SELECT ROWID, name, avatar_url FROM ${TABLES.USERS} WHERE ROWID IN (${userInClause}) LIMIT 500`
      );
      const userMap = {};
      users.forEach((u) => { userMap[String(u.ROWID)] = u; });

      const map = {};
      assignments.forEach((a) => {
        const roleId = String(a.org_role_id);
        const user   = userMap[String(a.user_id)];
        if (!user) return;
        if (!map[roleId]) map[roleId] = [];
        map[roleId].push({
          id:        String(user.ROWID),
          name:      user.name || 'Unknown',
          avatarUrl: user.avatar_url || null,
          initials:  (user.name || 'U').split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase(),
        });
      });
      return map;
    } catch (_) { return {}; }
  }

  async _loadRolePermissions(tenantId, roleId) {
    try {
      const rows = await this.db.query(
        `SELECT permissions FROM ${TABLES.ORG_ROLE_PERMISSIONS} WHERE org_role_id = '${roleId}' LIMIT 1`
      );
      if (!rows.length) return { permissions: [], moduleAccess: [] };
      return this._parsePermsColumn(rows[0].permissions);
    } catch (_) { return { permissions: [], moduleAccess: [] }; }
  }

  async _upsertRolePermissions(tenantId, roleId, permissions, moduleAccess = []) {
    // Encode both permissions and moduleAccess into a single JSON column.
    // Format: when moduleAccess is non-empty, store as object { p: [...], m: [...] }
    // otherwise store as plain array for backward compatibility with existing rows.
    const encoded = moduleAccess.length > 0
      ? JSON.stringify({ p: permissions, m: moduleAccess })
      : JSON.stringify(permissions);

    const existing = await this.db.query(
      `SELECT ROWID FROM ${TABLES.ORG_ROLE_PERMISSIONS} WHERE tenant_id = '${tenantId}' ` +
      `AND org_role_id = '${roleId}' LIMIT 1`
    );
    if (existing.length > 0) {
      await this.db.update(TABLES.ORG_ROLE_PERMISSIONS, {
        ROWID: String(existing[0].ROWID),
        permissions: encoded,
      });
    } else {
      await this.db.insert(TABLES.ORG_ROLE_PERMISSIONS, {
        tenant_id:   String(tenantId),
        org_role_id: String(roleId),
        permissions: encoded,
      });
    }
  }

  // Parse the permissions column — supports both legacy array format and new object format
  _parsePermsColumn(raw) {
    try {
      const parsed = JSON.parse(raw || '[]');
      if (Array.isArray(parsed)) {
        return { permissions: parsed, moduleAccess: [] };
      }
      if (parsed && typeof parsed === 'object') {
        return {
          permissions:  Array.isArray(parsed.p) ? parsed.p : [],
          moduleAccess: Array.isArray(parsed.m) ? parsed.m : [],
        };
      }
      return { permissions: [], moduleAccess: [] };
    } catch (_) {
      return { permissions: [], moduleAccess: [] };
    }
  }

  _formatRole(r, permsMap, countMap) {
    const roleData = permsMap[String(r.ROWID)] || {};
    return {
      id: String(r.ROWID),
      name: r.name,
      description: r.description || '',
      color: r.color || '#4F46E5',
      level: Number(r.level) || 0,
      parentRoleId: r.parent_role_id ? String(r.parent_role_id) : null,
      permissions:  Array.isArray(roleData) ? roleData : (roleData.permissions  || []),
      moduleAccess: Array.isArray(roleData) ? []       : (roleData.moduleAccess || []),
      userCount: countMap[String(r.ROWID)] || 0,
      isActive: r.is_active !== false,
      createdAt: r.CREATEDTIME,
    };
  }
}

module.exports = OrgRolesController;
