'use strict';

const DataStoreService = require('../services/DataStoreService');
const AuditService = require('../services/AuditService');
const ResponseHelper = require('../utils/ResponseHelper');
const Validator = require('../utils/Validator');
const { TABLES, USER_STATUS, AUDIT_ACTION, ROLES } = require('../utils/Constants');

// Catalyst role IDs — each DS role maps to a distinct Catalyst app role.
// Values come from env vars set in Catalyst Console → Function → Environment Variables.
const CATALYST_ROLE_MAP = {
  TENANT_ADMIN:  process.env.CATALYST_ROLE_TENANT_ADMIN  || '17682000000989450',
  DELIVERY_LEAD: process.env.CATALYST_ROLE_DELIVERY_LEAD || '17682000000989455',
  TEAM_MEMBER:   process.env.CATALYST_ROLE_TEAM_MEMBER   || '17682000000989460',
  PMO:           process.env.CATALYST_ROLE_PMO           || '17682000000989465',
  EXEC:          process.env.CATALYST_ROLE_EXEC          || '17682000000989470',
  CLIENT:        process.env.CATALYST_ROLE_CLIENT        || '17682000000989475',
  SUPER_ADMIN:   process.env.CATALYST_ROLE_SUPER_ADMIN   || '17682000001011209',
};

// Which roles each inviter role is allowed to create
const INVITE_ALLOWED_ROLES = {
  [ROLES.TENANT_ADMIN]: [ROLES.TENANT_ADMIN, ROLES.PMO, ROLES.DELIVERY_LEAD, ROLES.TEAM_MEMBER, ROLES.EXEC, ROLES.CLIENT],
  [ROLES.PMO]:          [ROLES.DELIVERY_LEAD, ROLES.TEAM_MEMBER, ROLES.EXEC, ROLES.CLIENT],
  [ROLES.DELIVERY_LEAD]: [ROLES.TEAM_MEMBER, ROLES.CLIENT],
};

/**
 * AdminController – tenant admin operations: user management, invites, settings.
 */
class AdminController {
  constructor(catalystApp) {
    this.db = new DataStoreService(catalystApp);
    this.audit = new AuditService(this.db);
    this.auth = catalystApp.userManagement();
  }

  /**
   * POST /api/admin/users/invite
   * Registers a new user in the Catalyst org and creates their DS profile.
   * Uses Catalyst registerUser() so the invite email + account setup is handled by Catalyst.
   * DB insert happens ONLY after Catalyst registration succeeds (fatal if it fails).
   *
   * Role-based invite permissions:
   *   TENANT_ADMIN  → all roles
   *   PMO           → DELIVERY_LEAD, TEAM_MEMBER, EXEC, CLIENT
   *   DELIVERY_LEAD → TEAM_MEMBER, CLIENT
   */
  async inviteUserOrg(req, res) {
    try {
      const { tenantId, id: invitedBy, name: inviterName, role: inviterRole, tenantName } = req.currentUser;
      const data = Validator.validateInviteUser(req.body);

      // Role-based permission: check inviter can create the requested role
      const allowedRoles = INVITE_ALLOWED_ROLES[inviterRole] || [];
      if (!allowedRoles.includes(data.role)) {
        return ResponseHelper.forbidden(res,
          `Your role (${inviterRole}) cannot invite users with role ${data.role}`);
      }

      // Duplicate email check within this tenant
      const existing = await this.db.query(
        `SELECT ROWID FROM ${TABLES.USERS} WHERE tenant_id = '${tenantId}' ` +
        `AND email = '${DataStoreService.escape(data.email)}' LIMIT 1`
      );
      if (existing.length > 0) {
        return ResponseHelper.conflict(res, 'A user with this email already exists in your organisation');
      }

      const nameParts = data.name.trim().split(/\s+/);
      const firstName = nameParts[0];
      const lastName  = nameParts.slice(1).join(' ') || '';

      // Get the current user's Catalyst org_id — required by registerUser()
      const currentCatalystUser = await this.auth.getCurrentUser();
      const orgId = currentCatalystUser.org_id || '';

      /** Signup email config — Catalyst replaces %LINK% with the activation URL */
      const signupConfig = {
        platform_type: 'web',
        template_details: {
          senders_mail: process.env.FROM_EMAIL || 'noreply@deliverysync.app',
          subject: `${inviterName} invited you to join ${tenantName} on Delivery Sync`,
          message: buildInviteEmailHtml({ firstName, lastName, inviterName, tenantName, role: data.role }),
        },
        redirect_url: `${process.env.APP_BASE_URL || req.headers.origin || 'https://your-app.com'}/__catalyst/auth/login`,
      };

      /** User config */
      const userConfig = {
        first_name: firstName,
        last_name:  lastName,
        email_id:   data.email.toLowerCase(),
        role_id:    CATALYST_ROLE_MAP[data.role] || CATALYST_ROLE_MAP.TEAM_MEMBER,
        org_id:     orgId,
      };

      /** Invite via Catalyst registerUser — fatal if fails, no DB insert */
      const registeredUser = await this.auth.registerUser(signupConfig, userConfig);

      /** DB insert ONLY after successful Catalyst registration */
      const user = await this.db.insert(TABLES.USERS, {
        tenant_id:        tenantId,
        catalyst_user_id: registeredUser.user_details.user_id,
        catalyst_org_id:  registeredUser.user_details.org_id || orgId,
        email:            registeredUser.user_details.email_id,
        name:             data.name,
        role:             data.role,
        status:           USER_STATUS.INVITED,
        invited_by:       invitedBy,
      });

      await this.audit.log({
        tenantId, entityType: 'user', entityId: String(user.ROWID),
        action: AUDIT_ACTION.CREATE,
        newValue: { email: data.email, role: data.role, catalystUserId: registeredUser.user_details.user_id },
        performedBy: invitedBy,
      });

      return ResponseHelper.created(res, {
        user: {
          id:     String(user.ROWID),
          email:  data.email,
          name:   data.name,
          role:   data.role,
          status: USER_STATUS.INVITED,
        },
      }, `Invitation sent to ${data.email}. They'll receive an email to set up their account.`);
    } catch (err) {
      console.error('[AdminController] inviteUserOrg error:', err.message);
      if (err.isValidation) return ResponseHelper.validationError(res, err.message, err.details);
      return ResponseHelper.serverError(res, err.message);
    }
  }

  /**
   * GET /api/admin/users
   */
  async listUsers(req, res) {
    try {
      const { tenantId } = req.currentUser;
      const { status, role } = req.query;

      const conditions = [`tenant_id = '${tenantId}'`];
      if (status) conditions.push(`status = '${DataStoreService.escape(status)}'`);
      if (role) conditions.push(`role = '${DataStoreService.escape(role)}'`);

      const users = await this.db.query(
        `SELECT * FROM ${TABLES.USERS} WHERE ${conditions.join(' AND ')} ORDER BY CREATEDTIME DESC LIMIT 200`
      );

      return ResponseHelper.success(res, {
        users: users.map((u) => ({
          id: String(u.ROWID), name: u.name, email: u.email,
          role: u.role, status: u.status, avatarUrl: u.avatar_url || u.avtar_url || '',
          invitedBy: u.invited_by, createdAt: u.CREATEDTIME,
        })),
      });
    } catch (err) {
      return ResponseHelper.serverError(res, err.message);
    }
  }

  /**
   * PUT /api/admin/users/:userId
   * Update role or status.
   */
  async updateUser(req, res) {
    try {
      const { tenantId, id: performedBy } = req.currentUser;
      const { userId } = req.params;

      const existing = await this.db.findById(TABLES.USERS, userId, tenantId);
      if (!existing) return ResponseHelper.notFound(res, 'User not found');

      const { role, status } = req.body;

      if (role && !Object.values(ROLES).includes(role)) {
        return ResponseHelper.validationError(res, `Invalid role: ${role}`);
      }

      const updatePayload = { ROWID: userId };
      if (role) updatePayload.role = role;
      if (status) updatePayload.status = status;

      await this.db.update(TABLES.USERS, updatePayload);

      if (role && role !== existing.role) {
        await this.audit.log({
          tenantId, entityType: 'user', entityId: userId,
          action: AUDIT_ACTION.ROLE_CHANGE,
          oldValue: { role: existing.role },
          newValue: { role },
          performedBy,
        });
      }

      return ResponseHelper.success(res, {
        userId, role: role || existing.role, status: status || existing.status,
      });
    } catch (err) {
      return ResponseHelper.serverError(res, err.message);
    }
  }

  /**
   * DELETE /api/admin/users/:userId
   * Deactivate (not hard-delete) to preserve audit history.
   */
  async deactivateUser(req, res) {
    try {
      const { tenantId, id: performedBy } = req.currentUser;
      const { userId } = req.params;

      if (userId === performedBy) {
        return ResponseHelper.validationError(res, 'You cannot deactivate yourself');
      }

      const existing = await this.db.findById(TABLES.USERS, userId, tenantId);
      if (!existing) return ResponseHelper.notFound(res, 'User not found');

      await this.db.update(TABLES.USERS, { ROWID: userId, status: USER_STATUS.INACTIVE });

      await this.audit.log({
        tenantId, entityType: 'user', entityId: userId,
        action: AUDIT_ACTION.STATUS_CHANGE,
        oldValue: { status: existing.status },
        newValue: { status: USER_STATUS.INACTIVE },
        performedBy,
      });

      return ResponseHelper.success(res, null, 'User deactivated');
    } catch (err) {
      return ResponseHelper.serverError(res, err.message);
    }
  }

  /**
   * GET /api/admin/audit-logs?action=&entityType=&performedBy=&dateFrom=&dateTo=&limit=
   * Returns enriched audit logs (performer name + email resolved, changes parsed).
   */
  async getAuditLogs(req, res) {
    try {
      const { tenantId } = req.currentUser;
      const { action, entityType, performedBy, dateFrom, dateTo, limit } = req.query;

      const audit = new AuditService(this.db);
      const logs = await audit.getFilteredLogs(tenantId, {
        action: action || null,
        entityType: entityType || null,
        performedBy: performedBy || null,
        dateFrom: dateFrom || null,
        dateTo: dateTo || null,
        limit: Math.min(Number(limit) || 100, 500),
      });

      return ResponseHelper.success(res, { logs });
    } catch (err) {
      return ResponseHelper.serverError(res, err.message);
    }
  }

  /**
   * GET /api/admin/tenant
   * Get tenant settings.
   */
  async getTenant(req, res) {
    try {
      const { tenantId } = req.currentUser;
      const tenants = await this.db.query(
        `SELECT * FROM ${TABLES.TENANTS} WHERE ROWID = '${tenantId}' LIMIT 1`
      );
      if (tenants.length === 0) return ResponseHelper.notFound(res, 'Tenant not found');

      const t = tenants[0];
      return ResponseHelper.success(res, {
        tenant: {
          id: String(t.ROWID), name: t.name, slug: t.slug,
          plan: t.plan, status: t.status,
          settings: (() => { try { return JSON.parse(t.settings || '{}'); } catch { return {}; } })(),
        },
      });
    } catch (err) {
      return ResponseHelper.serverError(res, err.message);
    }
  }
}

// ─── Email Template ───────────────────────────────────────────────────────────

// Role-specific feature bullets shown in the invite email
const ROLE_FEATURES = {
  TENANT_ADMIN: [
    { icon: '⚙️', text: '<strong>Full admin access</strong> — manage users, projects and workspace settings.' },
    { icon: '📊', text: '<strong>Portfolio dashboard</strong> — see RAG health across every project.' },
    { icon: '📋', text: '<strong>Reports & insights</strong> — generate and share delivery reports.' },
  ],
  DELIVERY_LEAD: [
    { icon: '🚀', text: '<strong>Lead your projects</strong> — manage milestones, blockers and RAID logs.' },
    { icon: '📝', text: '<strong>Submit standups & EODs</strong> — keep stakeholders informed daily.' },
    { icon: '⚡', text: '<strong>Action tracking</strong> — assign, follow up and close action items.' },
    { icon: '📊', text: '<strong>Project dashboard</strong> — real-time RAG status and delivery health.' },
  ],
  PMO: [
    { icon: '📊', text: '<strong>Portfolio view</strong> — track delivery health across all projects.' },
    { icon: '📋', text: '<strong>Generate reports</strong> — weekly, monthly and custom delivery reports.' },
    { icon: '🔍', text: '<strong>Risk & issue visibility</strong> — full RAID register across the portfolio.' },
  ],
  TEAM_MEMBER: [
    { icon: '📝', text: '<strong>Daily standups</strong> — submit your updates and blockers every morning.' },
    { icon: '✅', text: '<strong>Action items</strong> — view and complete actions assigned to you.' },
    { icon: '🚧', text: '<strong>Blocker register</strong> — raise and track blockers on your project.' },
    { icon: '📅', text: '<strong>Milestone tracking</strong> — stay on top of key delivery dates.' },
  ],
  EXEC: [
    { icon: '📊', text: '<strong>Executive dashboard</strong> — portfolio-level RAG status at a glance.' },
    { icon: '📋', text: '<strong>Delivery reports</strong> — access detailed project and portfolio reports.' },
    { icon: '🔍', text: '<strong>Risk visibility</strong> — escalated blockers and critical issues.' },
  ],
  CLIENT: [
    { icon: '📊', text: '<strong>Project dashboard</strong> — live status of your project delivery.' },
    { icon: '📅', text: '<strong>Milestone updates</strong> — see key dates and delivery progress.' },
    { icon: '📋', text: '<strong>Shared reports</strong> — access delivery reports prepared for you.' },
  ],
};

function buildInviteEmailHtml({ firstName, lastName, inviterName, tenantName, role }) {
  firstName = firstName || 'there';
  lastName  = lastName  || '';
  const fullName      = lastName ? `${firstName} ${lastName}` : firstName;
  const roleLabel     = (role || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  const inviterInitials = (inviterName || 'DS').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  const features = ROLE_FEATURES[role] || ROLE_FEATURES.TEAM_MEMBER;
  const featureRows = features.map(f =>
    `<tr><td style="padding:6px 0;vertical-align:top;font-size:20px;width:32px">${f.icon}</td>` +
    `<td style="padding:6px 0;font-size:14px;color:#475569;line-height:1.6">${f.text}</td></tr>`
  ).join('');

  // %LINK% is replaced by Catalyst with the actual activation URL
  const ctaUrl = '%LINK%';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${escapeHtml(inviterName)} invited you to Delivery Sync</title>
</head>
<body style="margin:0;padding:0;background:#f0f4ff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,sans-serif;color:#1e293b">

<table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f4ff;padding:32px 0">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%">

  <!-- Card -->
  <tr><td style="background:#fff;border-radius:20px;overflow:hidden;box-shadow:0 8px 40px rgba(0,0,0,.10)">

    <!-- Top accent bar -->
    <table width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td style="background:linear-gradient(90deg,#2563eb,#7c3aed,#db2777);height:5px;font-size:0">&nbsp;</td>
    </tr>
    </table>

    <!-- Header -->
    <table width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td style="background:linear-gradient(135deg,#1e3a8a 0%,#4f46e5 50%,#7c3aed 100%);padding:40px 48px 36px">

        <!-- Logo row -->
        <table cellpadding="0" cellspacing="0" style="margin-bottom:32px">
        <tr>
          <td style="vertical-align:middle">
            <table cellpadding="0" cellspacing="0">
            <tr>
              <td style="background:rgba(255,255,255,.15);border-radius:12px;width:44px;height:44px;text-align:center;vertical-align:middle">
                <span style="font-size:22px;line-height:44px">📦</span>
              </td>
              <td style="padding-left:12px;vertical-align:middle">
                <div style="color:#fff;font-size:18px;font-weight:700;letter-spacing:-.3px">Delivery Sync</div>
                <div style="color:rgba(255,255,255,.55);font-size:11px;margin-top:1px">Delivery Intelligence Platform</div>
              </td>
            </tr>
            </table>
          </td>
        </tr>
        </table>

        <!-- Inviter callout -->
        <table cellpadding="0" cellspacing="0" style="background:rgba(255,255,255,.12);border-radius:14px;padding:20px 24px;margin-bottom:24px;width:100%">
        <tr>
          <td style="vertical-align:middle;width:52px">
            <div style="width:48px;height:48px;border-radius:50%;background:linear-gradient(135deg,#f59e0b,#ef4444);display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:700;color:#fff;text-align:center;line-height:48px">${escapeHtml(inviterInitials)}</div>
          </td>
          <td style="padding-left:16px;vertical-align:middle">
            <div style="color:rgba(255,255,255,.7);font-size:12px;text-transform:uppercase;letter-spacing:.8px;font-weight:600">Personal invitation from</div>
            <div style="color:#fff;font-size:20px;font-weight:700;margin-top:3px">${escapeHtml(inviterName)}</div>
          </td>
        </tr>
        </table>

        <div style="color:#fff;font-size:28px;font-weight:800;line-height:1.25;letter-spacing:-.5px">
          You're invited to join<br/>${escapeHtml(tenantName)}
        </div>
        <div style="color:rgba(255,255,255,.7);font-size:15px;margin-top:10px;line-height:1.6">
          ${escapeHtml(inviterName)} has added you as a team member on Delivery Sync.
        </div>

      </td>
    </tr>
    </table>

    <!-- Role badge strip -->
    <table width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td style="background:#f8f5ff;border-bottom:1px solid #ede9fe;padding:16px 48px">
        <table cellpadding="0" cellspacing="0">
        <tr>
          <td style="color:#6d28d9;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;padding-right:12px">Your role</td>
          <td>
            <span style="display:inline-block;background:#ede9fe;color:#5b21b6;border:1.5px solid #c4b5fd;border-radius:20px;padding:5px 16px;font-size:13px;font-weight:700;letter-spacing:.2px">${escapeHtml(roleLabel)}</span>
          </td>
        </tr>
        </table>
      </td>
    </tr>
    </table>

    <!-- Body -->
    <table width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td style="padding:36px 48px">

        <!-- Greeting -->
        <p style="font-size:16px;color:#374151;margin:0 0 8px;line-height:1.7">
          Hi <strong>${escapeHtml(fullName)}</strong>,
        </p>
        <p style="font-size:15px;color:#4b5563;margin:0 0 28px;line-height:1.7">
          <strong>${escapeHtml(inviterName)}</strong> has personally invited you to collaborate on the
          <strong>${escapeHtml(tenantName)}</strong> delivery workspace. As a <strong>${escapeHtml(roleLabel)}</strong>,
          here's what you'll be able to do:
        </p>

        <!-- Role features -->
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:14px;padding:20px 24px;margin-bottom:28px">
        <tr><td>
          <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:#64748b;margin-bottom:14px">What you can do</div>
          <table cellpadding="0" cellspacing="0" style="width:100%">
          ${featureRows}
          </table>
        </td></tr>
        </table>

        <!-- CTA -->
        <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px">
        <tr>
          <td align="center">
            <a href="${ctaUrl}" style="display:inline-block;background:linear-gradient(135deg,#2563eb,#7c3aed);color:#fff;text-decoration:none;font-size:16px;font-weight:700;padding:16px 44px;border-radius:14px;box-shadow:0 6px 20px rgba(99,102,241,.4);letter-spacing:.1px">
              Accept invitation &amp; sign in &rarr;
            </a>
            <div style="font-size:12px;color:#94a3b8;margin-top:10px">
              Button not working? <a href="${ctaUrl}" style="color:#6366f1;text-decoration:underline">Copy this link</a>
            </div>
          </td>
        </tr>
        </table>

        <!-- Steps -->
        <table width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #f1f5f9;padding-top:24px">
        <tr><td>
          <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:#64748b;margin-bottom:16px">How to get started</div>
          <table cellpadding="0" cellspacing="0">
          <tr>
            <td style="vertical-align:top;padding-bottom:14px">
              <table cellpadding="0" cellspacing="0">
              <tr>
                <td style="width:30px;height:30px;background:#e0e7ff;border-radius:50%;text-align:center;vertical-align:middle;font-size:13px;font-weight:700;color:#4f46e5;line-height:30px">1</td>
                <td style="padding-left:12px;font-size:14px;color:#475569;line-height:1.6">Click <strong>Accept invitation</strong> above — you'll be taken to the Delivery Sync login page.</td>
              </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="vertical-align:top;padding-bottom:14px">
              <table cellpadding="0" cellspacing="0">
              <tr>
                <td style="width:30px;height:30px;background:#e0e7ff;border-radius:50%;text-align:center;vertical-align:middle;font-size:13px;font-weight:700;color:#4f46e5;line-height:30px">2</td>
                <td style="padding-left:12px;font-size:14px;color:#475569;line-height:1.6">Sign in with your Zoho account — or create a free one if you don't have one yet.</td>
              </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="vertical-align:top">
              <table cellpadding="0" cellspacing="0">
              <tr>
                <td style="width:30px;height:30px;background:#e0e7ff;border-radius:50%;text-align:center;vertical-align:middle;font-size:13px;font-weight:700;color:#4f46e5;line-height:30px">3</td>
                <td style="padding-left:12px;font-size:14px;color:#475569;line-height:1.6">You'll land directly on the <strong>${escapeHtml(tenantName)}</strong> workspace, ready to go.</td>
              </tr>
              </table>
            </td>
          </tr>
          </table>
        </td></tr>
        </table>

      </td>
    </tr>
    </table>

    <!-- Footer -->
    <table width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:24px 48px;text-align:center">
        <p style="font-size:12px;color:#94a3b8;margin:0;line-height:1.8">
          This invitation was sent by <strong style="color:#64748b">${escapeHtml(inviterName)}</strong>
          on behalf of <strong style="color:#64748b">${escapeHtml(tenantName)}</strong>.<br/>
          If you weren't expecting this, you can safely ignore this email.<br/>
          &copy; ${new Date().getFullYear()} Delivery Sync &mdash; Delivery Intelligence Platform
        </p>
      </td>
    </tr>
    </table>

  </td></tr>
  <!-- End card -->

</table>
</td></tr>
</table>

</body>
</html>`;
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

module.exports = AdminController;
