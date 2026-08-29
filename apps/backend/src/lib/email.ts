import nodemailer from 'nodemailer';

// ─── Types ────────────────────────────────────────────────────────────────────
export interface SendEmailOptions {
  to: string;
  toName?: string;
  subject: string;
  html: string;
  text: string;
}

// ─── Config detection ─────────────────────────────────────────────────────────
const FROM_EMAIL = process.env.EMAIL_FROM ?? 'Boardly <noreply@boardly.app>';

const HAS_SES =
  !!process.env.AWS_ACCESS_KEY_ID &&
  !!process.env.AWS_SECRET_ACCESS_KEY &&
  !!process.env.AWS_SES_REGION;

const HAS_SMTP =
  !!process.env.SMTP_HOST && !!process.env.SMTP_PORT && !!process.env.SMTP_USER && !!process.env.SMTP_PASS;

// ─── Transport builders ───────────────────────────────────────────────────────

function buildSESTransport(): nodemailer.Transporter | null {
  if (!HAS_SES) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const awsSes = require('@aws-sdk/client-ses');
    const sesClient = new awsSes.SESClient({ region: process.env.AWS_SES_REGION });
    return nodemailer.createTransport({
      SES: { ses: sesClient, aws: awsSes },
    } as any);
  } catch {
    console.warn('[email] AWS SES transport init failed, falling back to SMTP.');
    return null;
  }
}

function buildSMTPTransport(): nodemailer.Transporter | null {
  if (!HAS_SMTP) return null;
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST!,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER!,
      pass: process.env.SMTP_PASS!,
    },
  });
}

// ─── Resolve transport once at startup ────────────────────────────────────────
let _transport: nodemailer.Transporter | null = null;

function getTransport(): nodemailer.Transporter | null {
  if (_transport) return _transport;
  _transport = buildSESTransport() ?? buildSMTPTransport();
  if (_transport) {
    console.log(`[email] Transport initialized: ${HAS_SES ? 'Amazon SES' : 'SMTP'}`);
  } else {
    console.warn('[email] No email transport configured — emails will be printed to console (dev mode).');
  }
  return _transport;
}

// ─── sendEmail ────────────────────────────────────────────────────────────────
export async function sendEmail(opts: SendEmailOptions): Promise<void> {
  const transport = getTransport();

  const mailOptions = {
    from: FROM_EMAIL,
    to: opts.toName ? `"${opts.toName}" <${opts.to}>` : opts.to,
    subject: opts.subject,
    html: opts.html,
    text: opts.text,
  };

  if (!transport) {
    // Dev fallback — log to console
    console.log('\n────────────────────────────────────────────────────────────');
    console.log('[email] DEV MODE — Would have sent email:');
    console.log(`  To:      ${mailOptions.to}`);
    console.log(`  From:    ${mailOptions.from}`);
    console.log(`  Subject: ${mailOptions.subject}`);
    console.log('[email] HTML body:');
    console.log(opts.html.substring(0, 800) + (opts.html.length > 800 ? '\n... (truncated)' : ''));
    console.log('────────────────────────────────────────────────────────────\n');
    return;
  }

  try {
    const info = await transport.sendMail(mailOptions);
    console.log(`[email] Sent to ${opts.to} — messageId: ${info.messageId}`);
  } catch (err) {
    console.error('[email] Failed to send email:', err);
    // Do NOT re-throw — email failures should never block the invite transaction
  }
}
