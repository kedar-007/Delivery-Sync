'use strict';

const ROLE_FEATURES = {
  ADMIN: [
    { icon: '⚙️', text: 'Manage organisation settings and billing' },
    { icon: '👥', text: 'Invite and manage team members' },
    { icon: '📦', text: 'Full access to all deliveries and reports' },
    { icon: '🔐', text: 'Configure roles and permissions' },
  ],
  MANAGER: [
    { icon: '📦', text: 'View and manage all deliveries' },
    { icon: '👥', text: 'Oversee team activity and assignments' },
    { icon: '📊', text: 'Access analytics and performance reports' },
    { icon: '✏️',  text: 'Edit delivery records and statuses' },
  ],
  TEAM_MEMBER: [
    { icon: '📦', text: 'View and update assigned deliveries' },
    { icon: '📋', text: 'Log delivery status and notes' },
    { icon: '🗺️',  text: 'Access route and location details' },
  ],
  DRIVER: [
    { icon: '🚚', text: 'View your assigned delivery runs' },
    { icon: '📍', text: 'Update live delivery status on the go' },
    { icon: '📋', text: 'Access proof-of-delivery and notes' },
  ],
};

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;')
    .replace(/'/g,  '&#39;');
}

// ─────────────────────────────────────────────────────────────────────────────
// Invite email  (used by AdminController.inviteUserOrg)
// ─────────────────────────────────────────────────────────────────────────────
function buildInviteEmailHtml({ firstName, lastName, inviterName, tenantName, role }) {
  firstName = firstName || 'there';
  lastName  = lastName  || '';
  const fullName        = lastName ? `${firstName} ${lastName}` : firstName;
  const roleLabel       = (role || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  const inviterInitials = (inviterName || 'DS').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  const features        = ROLE_FEATURES[role] || ROLE_FEATURES.TEAM_MEMBER;
  const featureRows     = features.map(f =>
    `<tr>
      <td style="padding:6px 0;vertical-align:top;font-size:20px;width:32px">${f.icon}</td>
      <td style="padding:6px 0;font-size:14px;color:#475569;line-height:1.6">${f.text}</td>
    </tr>`
  ).join('');

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
  <tr><td style="background:#fff;border-radius:20px;overflow:hidden;box-shadow:0 8px 40px rgba(0,0,0,.10)">

    <table width="100%" cellpadding="0" cellspacing="0">
    <tr><td style="background:linear-gradient(90deg,#2563eb,#7c3aed,#db2777);height:5px;font-size:0">&nbsp;</td></tr>
    </table>

    <table width="100%" cellpadding="0" cellspacing="0">
    <tr><td style="background:linear-gradient(135deg,#1e3a8a 0%,#4f46e5 50%,#7c3aed 100%);padding:40px 48px 36px">

      <table cellpadding="0" cellspacing="0" style="margin-bottom:32px">
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

      <table cellpadding="0" cellspacing="0" style="background:rgba(255,255,255,.12);border-radius:14px;padding:20px 24px;margin-bottom:24px;width:100%">
      <tr>
        <td style="vertical-align:middle;width:52px">
          <div style="width:48px;height:48px;border-radius:50%;background:linear-gradient(135deg,#f59e0b,#ef4444);text-align:center;line-height:48px;font-size:18px;font-weight:700;color:#fff">${escapeHtml(inviterInitials)}</div>
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

    </td></tr>
    </table>

    <table width="100%" cellpadding="0" cellspacing="0">
    <tr><td style="background:#f8f5ff;border-bottom:1px solid #ede9fe;padding:16px 48px">
      <table cellpadding="0" cellspacing="0">
      <tr>
        <td style="color:#6d28d9;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;padding-right:12px">Your role</td>
        <td>
          <span style="display:inline-block;background:#ede9fe;color:#5b21b6;border:1.5px solid #c4b5fd;border-radius:20px;padding:5px 16px;font-size:13px;font-weight:700;letter-spacing:.2px">${escapeHtml(roleLabel)}</span>
        </td>
      </tr>
      </table>
    </td></tr>
    </table>

    <table width="100%" cellpadding="0" cellspacing="0">
    <tr><td style="padding:36px 48px">

      <p style="font-size:16px;color:#374151;margin:0 0 8px;line-height:1.7">
        Hi <strong>${escapeHtml(fullName)}</strong>,
      </p>
      <p style="font-size:15px;color:#4b5563;margin:0 0 28px;line-height:1.7">
        <strong>${escapeHtml(inviterName)}</strong> has personally invited you to collaborate on the
        <strong>${escapeHtml(tenantName)}</strong> delivery workspace. As a <strong>${escapeHtml(roleLabel)}</strong>,
        here's what you'll be able to do:
      </p>

      <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:14px;padding:20px 24px;margin-bottom:28px">
      <tr><td>
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:#64748b;margin-bottom:14px">What you can do</div>
        <table cellpadding="0" cellspacing="0" style="width:100%">${featureRows}</table>
      </td></tr>
      </table>

      <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px">
      <tr><td align="center">
        <a href="${ctaUrl}" style="display:inline-block;background:linear-gradient(135deg,#2563eb,#7c3aed);color:#fff;text-decoration:none;font-size:16px;font-weight:700;padding:16px 44px;border-radius:14px;box-shadow:0 6px 20px rgba(99,102,241,.4);letter-spacing:.1px">
          Accept invitation &amp; sign in &rarr;
        </a>
        <div style="font-size:12px;color:#94a3b8;margin-top:10px">
          Button not working? <a href="${ctaUrl}" style="color:#6366f1;text-decoration:underline">Copy this link</a>
        </div>
      </td></tr>
      </table>

      <table width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #f1f5f9;padding-top:24px">
      <tr><td>
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:#64748b;margin-bottom:16px">How to get started</div>
        <table cellpadding="0" cellspacing="0">
        <tr><td style="vertical-align:top;padding-bottom:14px">
          <table cellpadding="0" cellspacing="0"><tr>
            <td style="width:30px;height:30px;background:#e0e7ff;border-radius:50%;text-align:center;vertical-align:middle;font-size:13px;font-weight:700;color:#4f46e5;line-height:30px">1</td>
            <td style="padding-left:12px;font-size:14px;color:#475569;line-height:1.6">Click <strong>Accept invitation</strong> above — you'll be taken to the Delivery Sync login page.</td>
          </tr></table>
        </td></tr>
        <tr><td style="vertical-align:top;padding-bottom:14px">
          <table cellpadding="0" cellspacing="0"><tr>
            <td style="width:30px;height:30px;background:#e0e7ff;border-radius:50%;text-align:center;vertical-align:middle;font-size:13px;font-weight:700;color:#4f46e5;line-height:30px">2</td>
            <td style="padding-left:12px;font-size:14px;color:#475569;line-height:1.6">Sign in with your Zoho account — or create a free one if you don't have one yet.</td>
          </tr></table>
        </td></tr>
        <tr><td style="vertical-align:top">
          <table cellpadding="0" cellspacing="0"><tr>
            <td style="width:30px;height:30px;background:#e0e7ff;border-radius:50%;text-align:center;vertical-align:middle;font-size:13px;font-weight:700;color:#4f46e5;line-height:30px">3</td>
            <td style="padding-left:12px;font-size:14px;color:#475569;line-height:1.6">You'll land directly on the <strong>${escapeHtml(tenantName)}</strong> workspace, ready to go.</td>
          </tr></table>
        </td></tr>
        </table>
      </td></tr>
      </table>

    </td></tr>
    </table>

    <table width="100%" cellpadding="0" cellspacing="0">
    <tr><td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:24px 48px;text-align:center">
      <p style="font-size:12px;color:#94a3b8;margin:0;line-height:1.8">
        This invitation was sent by <strong style="color:#64748b">${escapeHtml(inviterName)}</strong>
        on behalf of <strong style="color:#64748b">${escapeHtml(tenantName)}</strong>.<br/>
        If you weren't expecting this, you can safely ignore this email.<br/>
        &copy; ${new Date().getFullYear()} Delivery Sync &mdash; Delivery Intelligence Platform
      </p>
    </td></tr>
    </table>

  </td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Email update email  (used by UserController.updateEmail)
// Kept compact intentionally — Catalyst registerUser has a message size limit.
// ─────────────────────────────────────────────────────────────────────────────
function buildEmailUpdateHtml({ firstName, lastName, tenantName, newEmail, oldEmail }) {
  firstName = firstName || 'there';
  lastName  = lastName  || '';
  const fullName = lastName ? `${firstName} ${lastName}` : firstName;
  const ctaUrl   = '%LINK%';
  const year     = new Date().getFullYear();

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/><title>Email address updated</title></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 0">
<tr><td align="center">
<table width="540" cellpadding="0" cellspacing="0" style="max-width:540px;width:100%;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 8px 32px rgba(0,0,0,.10)">

  <tr><td style="background:#4f46e5;height:4px;font-size:0">&nbsp;</td></tr>

  <!-- Header -->
  <tr><td style="background:linear-gradient(135deg,#1e1b4b,#0f172a);padding:28px 36px 24px">
    <div style="display:inline-block;background:rgba(20,184,166,.15);border:1px solid rgba(20,184,166,.35);border-radius:6px;padding:3px 10px;font-size:10px;font-weight:700;letter-spacing:.1em;color:#2dd4bf;text-transform:uppercase;margin-bottom:14px">DSV OpsPulse &nbsp;&#183;&nbsp; ${escapeHtml(tenantName)}</div>
    <div style="color:#fff;font-size:22px;font-weight:800;line-height:1.3;letter-spacing:-.3px">Your email address has been updated</div>
    <div style="color:rgba(255,255,255,.55);font-size:13px;margin-top:8px">Complete the step below to regain access to your account.</div>
  </td></tr>

  <!-- Email change row -->
  <tr><td style="background:#f8faff;border-top:1px solid #e8edf8;border-bottom:1px solid #e8edf8;padding:18px 36px">
    <table cellpadding="0" cellspacing="0" style="width:100%"><tr>
      <td style="width:45%;vertical-align:middle">
        <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#94a3b8;margin-bottom:6px">Previous</div>
        <div style="background:#f1f5f9;border:1px solid #e2e8f0;border-radius:8px;padding:8px 12px;font-size:12px;color:#94a3b8;text-decoration:line-through;word-break:break-all">${escapeHtml(oldEmail)}</div>
      </td>
      <td style="width:10%;text-align:center;vertical-align:middle;font-size:18px;color:#6366f1;font-weight:700">&#8594;</td>
      <td style="width:45%;vertical-align:middle">
        <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#0d9488;margin-bottom:6px">New email</div>
        <div style="background:#f0fdfa;border:1px solid #99f6e4;border-radius:8px;padding:8px 12px;font-size:12px;font-weight:700;color:#0f766e;word-break:break-all">${escapeHtml(newEmail)}</div>
      </td>
    </tr></table>
  </td></tr>

  <!-- Body -->
  <tr><td style="padding:28px 36px">
    <p style="font-size:15px;color:#1e293b;margin:0 0 6px;font-weight:600">Hi ${escapeHtml(fullName)},</p>
    <p style="font-size:13px;color:#475569;margin:0 0 22px;line-height:1.7">
      Your sign-in email on <strong>${escapeHtml(tenantName)}</strong> has been changed.
      Use <strong style="color:#0f766e">${escapeHtml(newEmail)}</strong> to sign in going forward.
    </p>

    <!-- Warning box -->
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#fffbeb;border:1px solid #fcd34d;border-radius:10px;margin-bottom:22px">
    <tr><td style="padding:14px 18px">
      <div style="font-size:12px;font-weight:800;color:#78350f;margin-bottom:4px">&#9889; Action required — activate your new sign-in</div>
      <div style="font-size:12px;color:#92400e;line-height:1.6">Your Zoho identity has been re-created. Click the button below to set your password and restore access.</div>
    </td></tr>
    </table>

    <!-- CTA -->
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px">
    <tr><td align="center">
      <a href="${ctaUrl}" style="display:inline-block;background:#4f46e5;color:#fff;text-decoration:none;font-size:14px;font-weight:700;padding:14px 40px;border-radius:10px">
        Activate &amp; sign in &rarr;
      </a>
      <div style="font-size:11px;color:#94a3b8;margin-top:10px">
        Button not working? <a href="${ctaUrl}" style="color:#6366f1">Copy this link</a>
      </div>
    </td></tr>
    </table>

    <!-- Steps -->
    <table cellpadding="0" cellspacing="0" style="width:100%;border-top:1px solid #f1f5f9;padding-top:20px">
    <tr><td style="padding-top:20px">
      <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#94a3b8;margin-bottom:14px">How to get back in</div>
      <table cellpadding="0" cellspacing="0">
      <tr><td style="padding-bottom:12px">
        <table cellpadding="0" cellspacing="0"><tr>
          <td style="width:24px;height:24px;background:#e0e7ff;border-radius:6px;text-align:center;line-height:24px;font-size:11px;font-weight:800;color:#4f46e5;vertical-align:top">1</td>
          <td style="padding-left:10px;font-size:12px;color:#475569;line-height:1.6;vertical-align:top">Click <strong>Activate &amp; sign in</strong> — you'll land on the login page.</td>
        </tr></table>
      </td></tr>
      <tr><td style="padding-bottom:12px">
        <table cellpadding="0" cellspacing="0"><tr>
          <td style="width:24px;height:24px;background:#e0e7ff;border-radius:6px;text-align:center;line-height:24px;font-size:11px;font-weight:800;color:#4f46e5;vertical-align:top">2</td>
          <td style="padding-left:10px;font-size:12px;color:#475569;line-height:1.6;vertical-align:top">Sign in with <strong style="color:#0f766e">${escapeHtml(newEmail)}</strong> and set your password.</td>
        </tr></table>
      </td></tr>
      <tr><td>
        <table cellpadding="0" cellspacing="0"><tr>
          <td style="width:24px;height:24px;background:#ccfbf1;border-radius:6px;text-align:center;line-height:24px;font-size:11px;font-weight:800;color:#0f766e;vertical-align:top">3</td>
          <td style="padding-left:10px;font-size:12px;color:#475569;line-height:1.6;vertical-align:top">You're in — all your <strong>${escapeHtml(tenantName)}</strong> data is intact.</td>
        </tr></table>
      </td></tr>
      </table>
    </td></tr>
    </table>
  </td></tr>

  <!-- Didn't request banner -->
  <tr><td style="background:#fef2f2;border-top:1px solid #fecaca;padding:14px 36px">
    <div style="font-size:12px;color:#b91c1c;line-height:1.6">
      &#128680; <strong>Didn't request this?</strong> Contact your <strong>${escapeHtml(tenantName)}</strong> workspace admin immediately.
    </div>
  </td></tr>

  <!-- Footer -->
  <tr><td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:18px 36px;text-align:center">
    <p style="font-size:11px;color:#94a3b8;margin:0;line-height:1.8">
      <strong style="color:#64748b">DSV OpsPulse</strong> &mdash; ${escapeHtml(tenantName)}<br/>
      &copy; ${year} DSV OpsPulse. Automated security notification.
    </p>
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}

module.exports = { buildInviteEmailHtml, buildEmailUpdateHtml };