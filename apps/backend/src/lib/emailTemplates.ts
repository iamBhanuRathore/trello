// ─── Email Templates ──────────────────────────────────────────────────────────
// Generates HTML email templates for Boardly transactional emails.

export interface InviteEmailOptions {
  toName: string;
  toEmail: string;
  inviterName: string;
  orgName: string;
  role: string;
  inviteUrl: string;
  expiresAt: Date;
}

const ROLE_LABELS: Record<string, string> = {
  org_owner: 'Organization Owner',
  org_admin: 'Organization Admin',
  billing_manager: 'Billing Manager',
  workspace_admin: 'Workspace Admin',
  member: 'Member',
  viewer: 'Viewer',
};

const ROLE_COLORS: Record<string, string> = {
  org_owner: '#7c3aed',
  org_admin: '#6d28d9',
  billing_manager: '#0891b2',
  workspace_admin: '#0284c7',
  member: '#059669',
  viewer: '#d97706',
};

function formatExpiry(date: Date): string {
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays <= 0) return 'today';
  if (diffDays === 1) return 'in 1 day';
  return `in ${diffDays} days`;
}

export function renderInviteEmail(opts: InviteEmailOptions): { subject: string; html: string; text: string } {
  const roleLabel = ROLE_LABELS[opts.role] ?? opts.role;
  const roleBadgeColor = ROLE_COLORS[opts.role] ?? '#6366f1';
  const expiryText = formatExpiry(opts.expiresAt);
  const displayName = opts.toName && opts.toName !== opts.toEmail.split('@')[0] ? opts.toName : '';

  const subject = `${opts.inviterName} invited you to join ${opts.orgName} on Boardly`;

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${subject}</title>
</head>
<body style="margin:0;padding:0;background-color:#0f172a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0f172a;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

          <!-- Logo Header -->
          <tr>
            <td style="padding-bottom:32px;text-align:center;">
              <div style="display:inline-flex;align-items:center;gap:10px;">
                <div style="width:36px;height:36px;background:linear-gradient(135deg,#6366f1,#8b5cf6);border-radius:8px;display:inline-block;vertical-align:middle;"></div>
                <span style="font-size:22px;font-weight:700;color:#f8fafc;vertical-align:middle;margin-left:10px;">Boardly</span>
              </div>
            </td>
          </tr>

          <!-- Card -->
          <tr>
            <td style="background:linear-gradient(135deg,#1e293b 0%,#1a2540 100%);border-radius:16px;border:1px solid rgba(99,102,241,0.2);overflow:hidden;">

              <!-- Gradient bar -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="height:4px;background:linear-gradient(90deg,#6366f1,#8b5cf6,#06b6d4);"></td>
                </tr>
              </table>

              <!-- Card content -->
              <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px;">
                <tr>
                  <td>

                    <!-- Headline -->
                    <h1 style="margin:0 0 8px 0;font-size:28px;font-weight:700;color:#f8fafc;line-height:1.2;">
                      You're invited! 🎉
                    </h1>
                    <p style="margin:0 0 32px 0;font-size:16px;color:#94a3b8;line-height:1.6;">
                      ${displayName ? `Hi <strong style="color:#e2e8f0">${displayName}</strong>, ` : ''}<strong style="color:#a5b4fc">${opts.inviterName}</strong> has invited you to join <strong style="color:#e2e8f0">${opts.orgName}</strong> on Boardly.
                    </p>

                    <!-- Info box -->
                    <table width="100%" cellpadding="0" cellspacing="0" style="background:rgba(99,102,241,0.08);border:1px solid rgba(99,102,241,0.2);border-radius:12px;margin-bottom:32px;">
                      <tr>
                        <td style="padding:20px 24px;">
                          <table width="100%" cellpadding="0" cellspacing="0">
                            <tr>
                              <td style="padding-bottom:12px;">
                                <span style="font-size:12px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:#64748b;">Organization</span><br/>
                                <span style="font-size:16px;font-weight:600;color:#e2e8f0;">${opts.orgName}</span>
                              </td>
                            </tr>
                            <tr>
                              <td style="padding-bottom:12px;border-top:1px solid rgba(99,102,241,0.15);padding-top:12px;">
                                <span style="font-size:12px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:#64748b;">Invited by</span><br/>
                                <span style="font-size:16px;font-weight:600;color:#e2e8f0;">${opts.inviterName}</span>
                              </td>
                            </tr>
                            <tr>
                              <td style="border-top:1px solid rgba(99,102,241,0.15);padding-top:12px;">
                                <span style="font-size:12px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:#64748b;">Your Role</span><br/>
                                <span style="display:inline-block;margin-top:4px;padding:4px 12px;border-radius:999px;font-size:13px;font-weight:600;color:#fff;background-color:${roleBadgeColor};">${roleLabel}</span>
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>

                    <!-- CTA Button -->
                    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
                      <tr>
                        <td align="center">
                          <a href="${opts.inviteUrl}"
                             style="display:inline-block;padding:16px 48px;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;text-decoration:none;border-radius:10px;font-size:16px;font-weight:700;letter-spacing:0.02em;box-shadow:0 4px 24px rgba(99,102,241,0.4);">
                            Accept Invitation
                          </a>
                        </td>
                      </tr>
                    </table>

                    <!-- Expiry warning -->
                    <p style="margin:0 0 32px 0;text-align:center;font-size:13px;color:#64748b;">
                      This invitation expires <strong style="color:#94a3b8;">${expiryText}</strong>
                    </p>

                    <!-- Divider -->
                    <hr style="border:none;border-top:1px solid rgba(99,102,241,0.15);margin:0 0 24px 0;" />

                    <!-- Backup link -->
                    <p style="margin:0 0 8px 0;font-size:13px;color:#64748b;">
                      If the button doesn't work, copy and paste this link into your browser:
                    </p>
                    <p style="margin:0 0 24px 0;font-size:12px;color:#6366f1;word-break:break-all;">
                      ${opts.inviteUrl}
                    </p>

                    <!-- Safety footer -->
                    <p style="margin:0;font-size:12px;color:#475569;line-height:1.6;">
                      If you weren't expecting this invitation, you can safely ignore this email.
                      Your account won't be created until you accept.
                    </p>

                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:24px 0;text-align:center;">
              <p style="margin:0;font-size:12px;color:#334155;">
                &copy; ${new Date().getFullYear()} Boardly &middot; Enterprise Project Management
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;

  const text = `
You're invited to join ${opts.orgName} on Boardly!

${opts.inviterName} has invited you as a ${roleLabel}.

Accept your invitation here:
${opts.inviteUrl}

This invitation expires ${expiryText}.

If you weren't expecting this, you can ignore this email.
`;

  return { subject, html, text };
}
