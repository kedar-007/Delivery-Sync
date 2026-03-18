'use strict';

const DataStoreService = require('../services/DataStoreService');
const AuditService = require('../services/AuditService');
const ResponseHelper = require('../utils/ResponseHelper');
const Validator = require('../utils/Validator');
const { TABLES, USER_STATUS, AUDIT_ACTION, ROLES } = require('../utils/Constants');

/**
 * AdminController – tenant admin operations: user management, invites, settings.
 */
class AdminController {
  constructor(catalystApp) {
    this.db = new DataStoreService(catalystApp);
    this.audit = new AuditService(this.db);
  }

  /**
   * POST /api/admin/users/invite
   * 1. Creates a pending user record in our DB.
   * 2. Invites the user to the Catalyst organisation (so they can log in via Zoho).
   * 3. Sends a branded HTML invitation email via Catalyst Mail.
   */
  async inviteUser(req, res) {
    try {
      const { tenantId, id: invitedBy, name: inviterName, tenantName } = req.currentUser;
      const data = Validator.validateInviteUser(req.body);

      // Check if email already exists in this tenant
      const existing = await this.db.query(
        `SELECT ROWID FROM ${TABLES.USERS} WHERE tenant_id = '${tenantId}' ` +
        `AND email = '${DataStoreService.escape(data.email)}' LIMIT 1`
      );
      if (existing.length > 0) {
        return ResponseHelper.conflict(res, 'A user with this email already exists in your organisation');
      }

      // Step 1: Create pending user record in our DB
      const user = await this.db.insert(TABLES.USERS, {
        tenant_id: tenantId,
        catalyst_user_id: '',
        email: data.email.toLowerCase(),
        name: data.name,
        role: data.role,
        status: USER_STATUS.INVITED,
        invited_by: invitedBy,
      });

      // Step 2: Invite user to Catalyst org so they can authenticate
      let catalystInvited = false;
      try {
        const userManagement = req.catalystApp.userManagement();
        // Get App User role (non-admin role for regular users)
        const roles = await userManagement.getAllRoles();
        const appUserRole = roles.find(r =>
          r.role_name === 'App User' || r.role_name === 'app-user'
        ) || roles[roles.length - 1]; // fallback to last role

        const nameParts = data.name.split(' ');
        await userManagement.inviteUser({
          first_name: nameParts[0] || data.name,
          last_name: nameParts.slice(1).join(' ') || '',
          email_id: data.email.toLowerCase(),
          role_details: { role_id: appUserRole.role_id },
        });
        catalystInvited = true;
      } catch (catalystErr) {
        // User may already be in the org, or org invite failed — not fatal
        console.warn('[AdminController] Catalyst org invite failed (non-fatal):', catalystErr.message);
      }

      // Step 3: Send branded invitation email
      try {
        const mail = req.catalystApp.mail();
        const loginUrl = `${req.headers.origin || 'https://your-app.com'}/__catalyst/auth/login`;
        const htmlBody = buildInviteEmailHtml({
          inviteeName: data.name,
          inviterName,
          tenantName,
          role: data.role,
          loginUrl,
        });
        await mail.sendMail({
          from_email: process.env.FROM_EMAIL || 'noreply@deliverysync.app',
          to_email: [data.email.toLowerCase()],
          subject: `${inviterName} invited you to ${tenantName} on Delivery Sync`,
          html_body: htmlBody,
        });
      } catch (mailErr) {
        console.warn('[AdminController] Email send failed (non-fatal):', mailErr.message);
      }

      await this.audit.log({
        tenantId, entityType: 'user', entityId: String(user.ROWID),
        action: AUDIT_ACTION.CREATE,
        newValue: { email: data.email, role: data.role, catalystInvited },
        performedBy: invitedBy,
      });

      return ResponseHelper.created(res, {
        user: {
          id: String(user.ROWID), email: data.email, name: data.name,
          role: data.role, status: USER_STATUS.INVITED, catalystInvited,
        },
      }, `Invitation sent to ${data.email}. They'll receive an email to set up their account.`);
    } catch (err) {
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
          role: u.role, status: u.status, avatarUrl: u.avatar_url || '',
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

function buildInviteEmailHtml({ inviteeName, inviterName, tenantName, role, loginUrl }) {
  const firstName = (inviteeName || '').split(' ')[0] || 'there';
  const roleLabel = (role || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>You're invited to Delivery Sync</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #f1f5f9; font-family: -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; color: #1e293b; }
  .wrapper { max-width: 600px; margin: 40px auto; padding: 0 16px; }
  .card { background: #fff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,.08); }
  .header { background: linear-gradient(135deg,#1e40af 0%,#7c3aed 100%); padding: 40px 40px 36px; }
  .logo-row { display: flex; align-items: center; gap: 12px; margin-bottom: 28px; }
  .logo-icon { width: 40px; height: 40px; background: rgba(255,255,255,.15); border-radius: 10px; display: flex; align-items: center; justify-content: center; }
  .logo-name { color: #fff; font-size: 18px; font-weight: 700; }
  .logo-tagline { color: rgba(255,255,255,.6); font-size: 12px; }
  .hero-text { color: #fff; font-size: 26px; font-weight: 700; line-height: 1.3; }
  .hero-sub { color: rgba(255,255,255,.75); font-size: 14px; margin-top: 8px; line-height: 1.6; }
  .body { padding: 36px 40px; }
  .greeting { font-size: 16px; color: #374151; margin-bottom: 20px; line-height: 1.6; }
  .role-badge { display: inline-block; background: #ede9fe; color: #6d28d9; border: 1px solid #c4b5fd; border-radius: 20px; padding: 4px 14px; font-size: 13px; font-weight: 600; margin: 12px 0; }
  .features { margin: 28px 0; padding: 24px; background: #f8fafc; border-radius: 12px; border: 1px solid #e2e8f0; }
  .features-title { font-size: 13px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: .5px; margin-bottom: 16px; }
  .feature { display: flex; align-items: flex-start; gap: 12px; margin-bottom: 14px; }
  .feature:last-child { margin-bottom: 0; }
  .feature-dot { width: 8px; height: 8px; border-radius: 50%; background: #6366f1; margin-top: 6px; flex-shrink: 0; }
  .feature-text { font-size: 14px; color: #475569; line-height: 1.5; }
  .feature-text strong { color: #1e293b; }
  .cta-section { text-align: center; margin: 32px 0; }
  .cta-btn { display: inline-block; background: linear-gradient(135deg,#2563eb 0%,#7c3aed 100%); color: #fff !important; text-decoration: none; font-size: 15px; font-weight: 600; padding: 14px 36px; border-radius: 12px; box-shadow: 0 4px 16px rgba(99,102,241,.35); letter-spacing: .2px; }
  .cta-note { font-size: 12px; color: #94a3b8; margin-top: 10px; }
  .steps { margin: 28px 0; }
  .steps-title { font-size: 13px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: .5px; margin-bottom: 16px; }
  .step { display: flex; align-items: flex-start; gap: 14px; margin-bottom: 14px; }
  .step-num { width: 28px; height: 28px; border-radius: 50%; background: #e0e7ff; color: #4f46e5; font-size: 13px; font-weight: 700; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
  .step-text { font-size: 14px; color: #475569; padding-top: 4px; line-height: 1.5; }
  .footer { padding: 24px 40px; background: #f8fafc; border-top: 1px solid #e2e8f0; text-align: center; }
  .footer p { font-size: 12px; color: #94a3b8; line-height: 1.7; }
  .footer a { color: #6366f1; text-decoration: none; }
</style>
</head>
<body>
<div class="wrapper">
  <div class="card">
    <!-- Header -->
    <div class="header">
      <div class="logo-row">
        <div class="logo-icon">
          <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="white" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/>
          </svg>
        </div>
        <div>
          <div class="logo-name">Delivery Sync</div>
          <div class="logo-tagline">Delivery Intelligence Platform</div>
        </div>
      </div>
      <div class="hero-text">You've been invited to join ${escapeHtml(tenantName)}</div>
      <div class="hero-sub">${escapeHtml(inviterName)} has added you to their workspace on Delivery Sync.</div>
    </div>

    <!-- Body -->
    <div class="body">
      <p class="greeting">
        Hi ${escapeHtml(firstName)}, 👋<br/><br/>
        <strong>${escapeHtml(inviterName)}</strong> has invited you to collaborate on <strong>${escapeHtml(tenantName)}</strong>'s delivery workspace.
        You've been assigned the role:
      </p>
      <div style="text-align:center">
        <span class="role-badge">${escapeHtml(roleLabel)}</span>
      </div>

      <div class="features">
        <div class="features-title">What you can do in Delivery Sync</div>
        <div class="feature"><div class="feature-dot"></div><div class="feature-text"><strong>Submit daily standups & EODs</strong> — keep your team updated on progress and blockers.</div></div>
        <div class="feature"><div class="feature-dot"></div><div class="feature-text"><strong>Track actions & blockers</strong> — never lose sight of what's preventing delivery.</div></div>
        <div class="feature"><div class="feature-dot"></div><div class="feature-text"><strong>RAID register</strong> — document risks, issues, assumptions and dependencies.</div></div>
        <div class="feature"><div class="feature-dot"></div><div class="feature-text"><strong>Live RAG dashboards</strong> — see project health across your portfolio at a glance.</div></div>
      </div>

      <div class="steps">
        <div class="steps-title">How to get started</div>
        <div class="step"><div class="step-num">1</div><div class="step-text">Click the button below to open Delivery Sync.</div></div>
        <div class="step"><div class="step-num">2</div><div class="step-text">Sign in with your Zoho account (or create one — it's free).</div></div>
        <div class="step"><div class="step-num">3</div><div class="step-text">Your account will be automatically linked to <strong>${escapeHtml(tenantName)}</strong>.</div></div>
      </div>

      <div class="cta-section">
        <a href="${loginUrl}" class="cta-btn">Accept invitation &amp; sign in →</a>
        <div class="cta-note">Button not working? Copy this link: ${loginUrl}</div>
      </div>
    </div>

    <!-- Footer -->
    <div class="footer">
      <p>
        This invitation was sent by <strong>${escapeHtml(inviterName)}</strong> from <strong>${escapeHtml(tenantName)}</strong>.<br/>
        If you didn't expect this invitation, you can safely ignore this email.<br/>
        &copy; ${new Date().getFullYear()} Delivery Sync &mdash; Delivery Intelligence Platform
      </p>
    </div>
  </div>
</div>
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
