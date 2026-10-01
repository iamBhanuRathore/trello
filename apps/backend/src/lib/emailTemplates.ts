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

export function renderInviteEmail(opts: InviteEmailOptions): {
  subject: string;
  html: string;
  text: string;
} {
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

// ─── Account Deactivated Email ────────────────────────────────────────────────
export interface DeactivatedEmailOptions {
  toName: string;
  toEmail: string;
  orgName: string;
  adminName?: string;
  reason?: string;
}

export function renderAccountDeactivatedEmail(opts: DeactivatedEmailOptions): {
  subject: string;
  html: string;
  text: string;
} {
  const displayName =
    opts.toName && opts.toName !== opts.toEmail.split('@')[0] ? opts.toName : 'there';
  const reasonText = opts.reason?.trim() || 'Administrative policy or account review';
  const adminText = opts.adminName || 'an organization administrator';
  const subject = `Notice: Your access to ${opts.orgName} has been deactivated`;

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
            <td style="background:linear-gradient(135deg,#1e293b 0%,#1a2540 100%);border-radius:16px;border:1px solid rgba(239,68,68,0.25);overflow:hidden;">

              <!-- Red/Amber Warning Accent Bar -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="height:4px;background:linear-gradient(90deg,#ef4444,#f97316,#eab308);"></td>
                </tr>
              </table>

              <!-- Card content -->
              <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px;">
                <tr>
                  <td>

                    <!-- Status Pill -->
                    <div style="display:inline-block;padding:4px 12px;border-radius:999px;font-size:12px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;color:#fca5a5;background-color:rgba(239,68,68,0.15);border:1px solid rgba(239,68,68,0.3);margin-bottom:16px;">
                      🔒 Account Access Deactivated
                    </div>

                    <!-- Headline -->
                    <h1 style="margin:0 0 12px 0;font-size:26px;font-weight:700;color:#f8fafc;line-height:1.2;">
                      Access to ${opts.orgName} Suspended
                    </h1>
                    <p style="margin:0 0 24px 0;font-size:15px;color:#94a3b8;line-height:1.6;">
                      Hi <strong style="color:#e2e8f0">${displayName}</strong>, your membership in <strong style="color:#f8fafc">${opts.orgName}</strong> has been deactivated by ${adminText}.
                    </p>

                    <!-- Reason Box -->
                    <table width="100%" cellpadding="0" cellspacing="0" style="background:rgba(239,68,68,0.06);border:1px solid rgba(239,68,68,0.2);border-radius:12px;margin-bottom:28px;">
                      <tr>
                        <td style="padding:18px 20px;">
                          <div style="font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#f87171;margin-bottom:4px;">
                            Stated Reason
                          </div>
                          <div style="font-size:14px;color:#e2e8f0;line-height:1.5;">
                            "${reasonText}"
                          </div>
                        </td>
                      </tr>
                    </table>

                    <!-- What this means -->
                    <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:10px;padding:16px 18px;margin-bottom:28px;">
                      <div style="font-size:12px;font-weight:600;color:#94a3b8;margin-bottom:8px;text-transform:uppercase;letter-spacing:0.05em;">
                        What happens now:
                      </div>
                      <table width="100%" cellpadding="0" cellspacing="0">
                        <tr>
                          <td style="padding-bottom:6px;font-size:13px;color:#cbd5e1;">
                            &bull; All active browser and mobile sessions for this organization have been securely logged out.
                          </td>
                        </tr>
                        <tr>
                          <td style="padding-bottom:6px;font-size:13px;color:#cbd5e1;">
                            &bull; Your assigned tasks, cards, and activity logs remain preserved in the organization.
                          </td>
                        </tr>
                        <tr>
                          <td style="font-size:13px;color:#cbd5e1;">
                            &bull; Access can be restored at any time by your organization owner or admin.
                          </td>
                        </tr>
                      </table>
                    </div>

                    <!-- Divider -->
                    <hr style="border:none;border-top:1px solid rgba(255,255,255,0.08);margin:0 0 20px 0;" />

                    <!-- Contact note -->
                    <p style="margin:0;font-size:13px;color:#64748b;line-height:1.6;">
                      If you believe this was done in error, please contact your organization owner or IT administrator directly.
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
                &copy; ${new Date().getFullYear()} Boardly &middot; Enterprise Security &amp; Compliance Notification
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
Account Notice: Access to ${opts.orgName} Deactivated

Hi ${displayName},

Your membership in ${opts.orgName} on Boardly has been deactivated by ${adminText}.

Reason: "${reasonText}"

What this means:
- All active sessions for this organization have been revoked.
- Your data and task assignments remain intact.
- An organization administrator can reactivate your account at any time.

If you believe this was done in error, please reach out to your organization administrator.
`;

  return { subject, html, text };
}

// ─── Account Reactivated Email ────────────────────────────────────────────────
export interface ReactivatedEmailOptions {
  toName: string;
  toEmail: string;
  orgName: string;
  adminName?: string;
  loginUrl?: string;
}

export function renderAccountReactivatedEmail(opts: ReactivatedEmailOptions): {
  subject: string;
  html: string;
  text: string;
} {
  const displayName =
    opts.toName && opts.toName !== opts.toEmail.split('@')[0] ? opts.toName : 'there';
  const adminText = opts.adminName || 'An administrator';
  const loginUrl = opts.loginUrl || 'http://localhost:5173/sign-in';
  const subject = `Your access to ${opts.orgName} has been reactivated 🎉`;

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
            <td style="background:linear-gradient(135deg,#1e293b 0%,#1a2540 100%);border-radius:16px;border:1px solid rgba(16,185,129,0.25);overflow:hidden;">

              <!-- Green/Teal Emerald Accent Bar -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="height:4px;background:linear-gradient(90deg,#10b981,#06b6d4,#6366f1);"></td>
                </tr>
              </table>

              <!-- Card content -->
              <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px;">
                <tr>
                  <td>

                    <!-- Status Pill -->
                    <div style="display:inline-block;padding:4px 12px;border-radius:999px;font-size:12px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;color:#6ee7b7;background-color:rgba(16,185,129,0.15);border:1px solid rgba(16,185,129,0.3);margin-bottom:16px;">
                      ✓ Account Reactivated
                    </div>

                    <!-- Headline -->
                    <h1 style="margin:0 0 12px 0;font-size:26px;font-weight:700;color:#f8fafc;line-height:1.2;">
                      Welcome back to ${opts.orgName}! 🎉
                    </h1>
                    <p style="margin:0 0 28px 0;font-size:15px;color:#94a3b8;line-height:1.6;">
                      Hi <strong style="color:#e2e8f0">${displayName}</strong>, your account in <strong style="color:#f8fafc">${opts.orgName}</strong> has been restored by ${adminText}. You can now sign back in to access your projects, workspaces, and team boards.
                    </p>

                    <!-- CTA Button -->
                    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
                      <tr>
                        <td align="center">
                          <a href="${loginUrl}"
                             style="display:inline-block;padding:15px 44px;background:linear-gradient(135deg,#10b981,#059669);color:#fff;text-decoration:none;border-radius:10px;font-size:15px;font-weight:700;letter-spacing:0.02em;box-shadow:0 4px 20px rgba(16,185,129,0.35);">
                            Sign In to Workspace
                          </a>
                        </td>
                      </tr>
                    </table>

                    <!-- Divider -->
                    <hr style="border:none;border-top:1px solid rgba(255,255,255,0.08);margin:0 0 20px 0;" />

                    <!-- Backup Link -->
                    <p style="margin:0 0 8px 0;font-size:12px;color:#64748b;">
                      Direct login URL:
                    </p>
                    <p style="margin:0;font-size:12px;color:#10b981;word-break:break-all;">
                      ${loginUrl}
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
Welcome back! Your access to ${opts.orgName} has been reactivated.

Hi ${displayName},

Your account in ${opts.orgName} on Boardly has been restored by ${adminText}.
You can sign back in here:
${loginUrl}
`;

  return { subject, html, text };
}

// ─── Billing Email Templates ──────────────────────────────────────────────────

export interface SubscriptionActivatedOptions {
  orgName: string;
  planName: string;
  seatCount: number;
  billingInterval: string;
  amount: string;
  manageUrl: string;
}

export function renderSubscriptionActivatedEmail(opts: SubscriptionActivatedOptions): {
  subject: string;
  html: string;
  text: string;
} {
  const subject = `🎉 Welcome to ${opts.planName}! Your subscription is active`;
  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>${subject}</title>
</head>
<body style="margin:0;padding:0;background-color:#0f172a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0f172a;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" style="max-width:560px;background-color:#1e293b;border-radius:12px;border:1px solid rgba(255,255,255,0.08);overflow:hidden;">
          <tr>
            <td style="padding:32px;background:linear-gradient(135deg,rgba(99,102,241,0.2),rgba(168,85,247,0.2));border-bottom:1px solid rgba(255,255,255,0.08);text-align:center;">
              <h1 style="margin:0;color:#f8fafc;font-size:24px;font-weight:700;">Boardly</h1>
              <p style="margin:8px 0 0 0;color:#a5b4fc;font-size:14px;">Subscription Activated</p>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;">
              <h2 style="margin:0 0 16px 0;color:#f8fafc;font-size:18px;">${opts.orgName} is now on ${opts.planName}</h2>
              <p style="color:#94a3b8;font-size:14px;line-height:1.6;margin:0 0 20px 0;">
                Your subscription has been successfully activated. Your team can now take full advantage of all premium features including custom workflows, advanced analytics, and expanded seat capacity.
              </p>
              <table width="100%" style="background-color:#0f172a;border-radius:8px;border:1px solid rgba(255,255,255,0.06);margin-bottom:24px;padding:16px;">
                <tr>
                  <td style="color:#64748b;font-size:13px;padding:6px 0;">Plan:</td>
                  <td align="right" style="color:#f8fafc;font-size:13px;font-weight:600;padding:6px 0;">${opts.planName}</td>
                </tr>
                <tr>
                  <td style="color:#64748b;font-size:13px;padding:6px 0;">Paid Seats:</td>
                  <td align="right" style="color:#f8fafc;font-size:13px;font-weight:600;padding:6px 0;">${opts.seatCount} seats</td>
                </tr>
                <tr>
                  <td style="color:#64748b;font-size:13px;padding:6px 0;">Billing Interval:</td>
                  <td align="right" style="color:#f8fafc;font-size:13px;font-weight:600;padding:6px 0;text-transform:capitalize;">${opts.billingInterval}</td>
                </tr>
                <tr>
                  <td style="color:#64748b;font-size:13px;padding:6px 0;">Total Amount:</td>
                  <td align="right" style="color:#10b981;font-size:13px;font-weight:700;padding:6px 0;">${opts.amount}</td>
                </tr>
              </table>
              <div align="center">
                <a href="${opts.manageUrl}" style="display:inline-block;padding:12px 28px;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;border-radius:8px;">Manage Subscription & Team</a>
              </div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
  const text = `Welcome to ${opts.planName}! Your subscription for ${opts.orgName} (${opts.seatCount} seats, ${opts.billingInterval}) is active. Manage at ${opts.manageUrl}`;
  return { subject, html, text };
}

export interface SeatAddedOptions {
  orgName: string;
  additionalSeats: number;
  totalSeats: number;
  proratedAmount: string;
  manageUrl: string;
}

export function renderSeatAddedEmail(opts: SeatAddedOptions): {
  subject: string;
  html: string;
  text: string;
} {
  const subject = `Seat Expansion Confirmed for ${opts.orgName}`;
  const html = `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8" /><title>${subject}</title></head>
<body style="margin:0;padding:0;background-color:#0f172a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0f172a;padding:40px 20px;">
    <tr><td align="center">
      <table width="100%" style="max-width:560px;background-color:#1e293b;border-radius:12px;border:1px solid rgba(255,255,255,0.08);padding:32px;">
        <h2 style="color:#f8fafc;font-size:18px;margin-top:0;">Seat Added to ${opts.orgName}</h2>
        <p style="color:#94a3b8;font-size:14px;line-height:1.6;">
          Your team capacity has expanded by <strong>${opts.additionalSeats} seat(s)</strong>. You now have <strong>${opts.totalSeats} total paid seats</strong>.
        </p>
        <p style="color:#94a3b8;font-size:14px;">Prorated charge: <strong>${opts.proratedAmount}</strong></p>
        <a href="${opts.manageUrl}" style="display:inline-block;margin-top:16px;padding:10px 20px;background:#6366f1;color:#fff;text-decoration:none;border-radius:6px;font-size:14px;">View Billing Details</a>
      </table>
    </td></tr>
  </table>
</body></html>`;
  const text = `Seat expansion confirmed for ${opts.orgName}. Added ${opts.additionalSeats} seats (total: ${opts.totalSeats}). Prorated amount: ${opts.proratedAmount}. Manage at ${opts.manageUrl}`;
  return { subject, html, text };
}

export interface SeatDecreaseOptions {
  orgName: string;
  targetSeats: number;
  effectiveDate: string;
  manageUrl: string;
}

export function renderSeatDecreaseScheduledEmail(opts: SeatDecreaseOptions): {
  subject: string;
  html: string;
  text: string;
} {
  const subject = `Seat Downsize Scheduled for ${opts.orgName}`;
  const html = `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8" /><title>${subject}</title></head>
<body style="margin:0;padding:0;background-color:#0f172a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0f172a;padding:40px 20px;">
    <tr><td align="center">
      <table width="100%" style="max-width:560px;background-color:#1e293b;border-radius:12px;border:1px solid rgba(255,255,255,0.08);padding:32px;">
        <h2 style="color:#f8fafc;font-size:18px;margin-top:0;">Seat Downsize Scheduled</h2>
        <p style="color:#94a3b8;font-size:14px;line-height:1.6;">
          Your plan for <strong>${opts.orgName}</strong> is scheduled to downsize to <strong>${opts.targetSeats} seats</strong> at the start of your next billing cycle on <strong>${opts.effectiveDate}</strong>.
        </p>
        <a href="${opts.manageUrl}" style="display:inline-block;margin-top:16px;padding:10px 20px;background:#6366f1;color:#fff;text-decoration:none;border-radius:6px;font-size:14px;">Manage Subscription</a>
      </table>
    </td></tr>
  </table>
</body></html>`;
  const text = `Seat downsize to ${opts.targetSeats} seats scheduled for ${opts.effectiveDate} for ${opts.orgName}. Manage at ${opts.manageUrl}`;
  return { subject, html, text };
}

export interface GuestOverageOptions {
  orgName: string;
  guestCount: number;
  guestCap: number;
  overagePrice: string;
  upgradeUrl: string;
}

export function renderGuestOverageEmail(opts: GuestOverageOptions): {
  subject: string;
  html: string;
  text: string;
} {
  const subject = `Guest Seat Allowance Exceeded for ${opts.orgName}`;
  const html = `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8" /><title>${subject}</title></head>
<body style="margin:0;padding:0;background-color:#0f172a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0f172a;padding:40px 20px;">
    <tr><td align="center">
      <table width="100%" style="max-width:560px;background-color:#1e293b;border-radius:12px;border:1px solid rgba(255,255,240,0.08);padding:32px;">
        <h2 style="color:#f59e0b;font-size:18px;margin-top:0;">Guest Limit Reached</h2>
        <p style="color:#94a3b8;font-size:14px;line-height:1.6;">
          Your organization <strong>${opts.orgName}</strong> is currently using <strong>${opts.guestCount} of ${opts.guestCap} included guest seats</strong>.
        </p>
        <p style="color:#94a3b8;font-size:14px;">Additional guest seats are billed at <strong>${opts.overagePrice}</strong>.</p>
        <a href="${opts.upgradeUrl}" style="display:inline-block;margin-top:16px;padding:10px 20px;background:#f59e0b;color:#000;font-weight:600;text-decoration:none;border-radius:6px;font-size:14px;">Upgrade Plan or Add Seats</a>
      </table>
    </td></tr>
  </table>
</body></html>`;
  const text = `Guest seat limit reached for ${opts.orgName} (${opts.guestCount}/${opts.guestCap}). Upgrade at ${opts.upgradeUrl}`;
  return { subject, html, text };
}

export interface PaymentFailedOptions {
  orgName: string;
  amountDue: string;
  updatePaymentUrl: string;
  gracePeriodDays: number;
}

export function renderPaymentFailedEmail(opts: PaymentFailedOptions): {
  subject: string;
  html: string;
  text: string;
} {
  const subject = `⚠️ Action Required: Payment Failed for ${opts.orgName}`;
  const html = `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8" /><title>${subject}</title></head>
<body style="margin:0;padding:0;background-color:#0f172a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0f172a;padding:40px 20px;">
    <tr><td align="center">
      <table width="100%" style="max-width:560px;background-color:#1e293b;border-radius:12px;border:1px solid rgba(239,68,68,0.3);padding:32px;">
        <div style="display:inline-block;padding:4px 10px;background:rgba(239,68,68,0.2);color:#ef4444;border-radius:4px;font-size:12px;font-weight:600;margin-bottom:12px;">Payment Failed</div>
        <h2 style="color:#f8fafc;font-size:18px;margin-top:0;">We couldn't process your payment of ${opts.amountDue}</h2>
        <p style="color:#94a3b8;font-size:14px;line-height:1.6;">
          Your latest invoice for <strong>${opts.orgName}</strong> could not be charged to your payment method on file. You have a <strong>${opts.gracePeriodDays}-day grace period</strong> before premium features and access are suspended.
        </p>
        <a href="${opts.updatePaymentUrl}" style="display:inline-block;margin-top:16px;padding:12px 24px;background:#ef4444;color:#fff;font-weight:600;text-decoration:none;border-radius:6px;font-size:14px;">Update Payment Method</a>
      </table>
    </td></tr>
  </table>
</body></html>`;
  const text = `Payment failed for ${opts.orgName} (${opts.amountDue}). Update card within ${opts.gracePeriodDays} days at ${opts.updatePaymentUrl}`;
  return { subject, html, text };
}

export interface DowngradeBlockedOptions {
  orgName: string;
  activeMembers: number;
  maxFreeMembers: number;
  manageUrl: string;
}

export function renderDowngradeBlockedEmail(opts: DowngradeBlockedOptions): {
  subject: string;
  html: string;
  text: string;
} {
  const subject = `Action Required: Free Plan Downgrade Pending Member Reduction`;
  const html = `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8" /><title>${subject}</title></head>
<body style="margin:0;padding:0;background-color:#0f172a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0f172a;padding:40px 20px;">
    <tr><td align="center">
      <table width="100%" style="max-width:560px;background-color:#1e293b;border-radius:12px;border:1px solid rgba(255,255,255,0.08);padding:32px;">
        <h2 style="color:#f8fafc;font-size:18px;margin-top:0;">Member Reduction Required for Free Plan</h2>
        <p style="color:#94a3b8;font-size:14px;line-height:1.6;">
          Your cancellation request for <strong>${opts.orgName}</strong> requires team size adjustment. You currently have <strong>${opts.activeMembers} active members</strong>, but the Free plan includes a maximum of <strong>${opts.maxFreeMembers} members</strong>.
        </p>
        <p style="color:#94a3b8;font-size:14px;">Please deactivate or remove ${opts.activeMembers - opts.maxFreeMembers} members so your downgrade can complete cleanly without data disruption.</p>
        <a href="${opts.manageUrl}" style="display:inline-block;margin-top:16px;padding:10px 20px;background:#6366f1;color:#fff;text-decoration:none;border-radius:6px;font-size:14px;">Manage Team Members</a>
      </table>
    </td></tr>
  </table>
</body></html>`;
  const text = `Member reduction required for ${opts.orgName} to downgrade to Free. Reduce from ${opts.activeMembers} to ${opts.maxFreeMembers} at ${opts.manageUrl}`;
  return { subject, html, text };
}

export interface SubscriptionCanceledOptions {
  orgName: string;
  effectiveDate: string;
  renewUrl: string;
}

export function renderSubscriptionCanceledEmail(opts: SubscriptionCanceledOptions): {
  subject: string;
  html: string;
  text: string;
} {
  const subject = `Subscription Cancellation Confirmed for ${opts.orgName}`;
  const html = `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8" /><title>${subject}</title></head>
<body style="margin:0;padding:0;background-color:#0f172a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0f172a;padding:40px 20px;">
    <tr><td align="center">
      <table width="100%" style="max-width:560px;background-color:#1e293b;border-radius:12px;border:1px solid rgba(255,255,255,0.08);padding:32px;">
        <h2 style="color:#f8fafc;font-size:18px;margin-top:0;">Subscription Canceled</h2>
        <p style="color:#94a3b8;font-size:14px;line-height:1.6;">
          Your subscription for <strong>${opts.orgName}</strong> has been canceled and will end on <strong>${opts.effectiveDate}</strong>. After this date, your team will transition to the Free plan.
        </p>
        <a href="${opts.renewUrl}" style="display:inline-block;margin-top:16px;padding:10px 20px;background:#6366f1;color:#fff;text-decoration:none;border-radius:6px;font-size:14px;">Reactivate Subscription</a>
      </table>
    </td></tr>
  </table>
</body></html>`;
  const text = `Subscription for ${opts.orgName} canceled, ending on ${opts.effectiveDate}. Reactivate at ${opts.renewUrl}`;
  return { subject, html, text };
}

export interface EnterpriseInvoiceSentOptions {
  orgName: string;
  invoiceNumber: string;
  amountDue: string;
  dueDate: string;
  pdfUrl: string;
}

export function renderEnterpriseInvoiceSentEmail(opts: EnterpriseInvoiceSentOptions): {
  subject: string;
  html: string;
  text: string;
} {
  const subject = `Invoice ${opts.invoiceNumber} for ${opts.orgName}`;
  const html = `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8" /><title>${subject}</title></head>
<body style="margin:0;padding:0;background-color:#0f172a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0f172a;padding:40px 20px;">
    <tr><td align="center">
      <table width="100%" style="max-width:560px;background-color:#1e293b;border-radius:12px;border:1px solid rgba(255,255,255,0.08);padding:32px;">
        <h2 style="color:#f8fafc;font-size:18px;margin-top:0;">Enterprise Invoice Issued</h2>
        <p style="color:#94a3b8;font-size:14px;line-height:1.6;">
          Invoice <strong>${opts.invoiceNumber}</strong> for <strong>${opts.orgName}</strong> has been finalized.
        </p>
        <p style="color:#94a3b8;font-size:14px;">Amount Due: <strong>${opts.amountDue}</strong> &middot; Due Date: <strong>${opts.dueDate}</strong></p>
        <a href="${opts.pdfUrl}" style="display:inline-block;margin-top:16px;padding:10px 20px;background:#6366f1;color:#fff;text-decoration:none;border-radius:6px;font-size:14px;">Download PDF Invoice</a>
      </table>
    </td></tr>
  </table>
</body></html>`;
  const text = `Invoice ${opts.invoiceNumber} for ${opts.orgName} (${opts.amountDue}, due ${opts.dueDate}). Download at ${opts.pdfUrl}`;
  return { subject, html, text };
}

// ─── Inbound-email threading templates (4.6b) ────────────────────────────────
// Comment + mention notifications sent with threading headers (Reply-To =
// board+token capability address, Message-ID per card) so recipients can
// reply-to-comment straight from their MUA. Keep the same dark visual
// language as the other templates.

export interface ThreadedEmailOptions {
  cardKey: string | null;
  cardTitle: string;
  actorName: string;
  cardUrl: string;
  /** Pre-truncated plain-text body of the comment. */
  commentText: string;
  /** Fully-formed Reply-To carrying the inbound capability token. */
  replyTo: string;
  /** Per-card Message-ID so replies thread. */
  messageId: string;
}

export function renderCommentEmail(opts: ThreadedEmailOptions): {
  subject: string;
  html: string;
  text: string;
  headers: Record<string, string>;
} {
  const subject = `Re: [${opts.cardKey || 'Task'}] ${opts.cardTitle}`;
  const headers = {
    'Reply-To': opts.replyTo,
    'Message-ID': opts.messageId,
    References: opts.messageId,
  };
  const html = `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8" /><title>${subject}</title></head>
<body style="margin:0;padding:0;background-color:#0f172a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0f172a;padding:40px 20px;">
    <tr><td align="center">
      <table width="100%" style="max-width:560px;background-color:#1e293b;border-radius:12px;border:1px solid rgba(255,255,255,0.08);padding:32px;">
        <p style="color:#94a3b8;font-size:14px;margin-top:0;"><strong style="color:#e2e8f0">${opts.actorName}</strong> commented on <strong style="color:#e2e8f0">${opts.cardKey ? `${opts.cardKey} ` : ''}${opts.cardTitle}</strong></p>
        <p style="color:#e2e8f0;font-size:14px;line-height:1.6;">${opts.commentText}</p>
        <a href="${opts.cardUrl}" style="display:inline-block;margin-top:16px;padding:10px 20px;background:#6366f1;color:#fff;text-decoration:none;border-radius:6px;font-size:14px;">Open task</a>
        <p style="color:#64748b;font-size:12px;margin-top:16px;">Reply to this email to add another comment.</p>
      </table>
    </td></tr>
  </table>
</body></html>`;
  const text = `${opts.actorName} commented on ${opts.cardKey ? `${opts.cardKey} ` : ''}${opts.cardTitle}:\n\n${opts.commentText}\n\nOpen: ${opts.cardUrl}\n(Reply to this email to comment.)`;
  return { subject, html, text, headers };
}

export function renderMentionEmail(opts: ThreadedEmailOptions): {
  subject: string;
  html: string;
  text: string;
  headers: Record<string, string>;
} {
  const subject = `${opts.actorName} mentioned you on [${opts.cardKey || 'Task'}] ${opts.cardTitle}`;
  const headers = {
    'Reply-To': opts.replyTo,
    'Message-ID': opts.messageId,
    References: opts.messageId,
  };
  const html = `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8" /><title>${subject}</title></head>
<body style="margin:0;padding:0;background-color:#0f172a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0f172a;padding:40px 20px;">
    <tr><td align="center">
      <table width="100%" style="max-width:560px;background-color:#1e293b;border-radius:12px;border:1px solid rgba(255,255,255,0.08);padding:32px;">
        <p style="color:#94a3b8;font-size:14px;margin-top:0;"><strong style="color:#e2e8f0">${opts.actorName}</strong> mentioned you on <strong style="color:#e2e8f0">${opts.cardKey ? `${opts.cardKey} ` : ''}${opts.cardTitle}</strong></p>
        <p style="color:#e2e8f0;font-size:14px;line-height:1.6;">${opts.commentText}</p>
        <a href="${opts.cardUrl}" style="display:inline-block;margin-top:16px;padding:10px 20px;background:#6366f1;color:#fff;text-decoration:none;border-radius:6px;font-size:14px;">Open task</a>
        <p style="color:#64748b;font-size:12px;margin-top:16px;">Reply to this email to respond in the thread.</p>
      </table>
    </td></tr>
  </table>
</body></html>`;
  const text = `${opts.actorName} mentioned you on ${opts.cardKey ? `${opts.cardKey} ` : ''}${opts.cardTitle}:\n\n${opts.commentText}\n\nOpen: ${opts.cardUrl}\n(Reply to this email to respond.)`;
  return { subject, html, text, headers };
}
