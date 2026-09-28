import nodemailer from 'nodemailer';
import { Resend } from 'resend';
import { logger } from './logger';

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

const HAS_RESEND = !!process.env.RESEND_API_KEY;

const HAS_SES =
  !!process.env.AWS_ACCESS_KEY_ID &&
  !!process.env.AWS_SECRET_ACCESS_KEY &&
  !!process.env.AWS_SES_REGION;

const HAS_SMTP =
  !!process.env.SMTP_HOST &&
  !!process.env.SMTP_PORT &&
  !!process.env.SMTP_USER &&
  !!process.env.SMTP_PASS;

// ─── Client / Transport Singletons ────────────────────────────────────────────
let _resendClient: Resend | null = null;
function getResendClient(): Resend | null {
  if (!HAS_RESEND) return null;
  if (!_resendClient) {
    _resendClient = new Resend(process.env.RESEND_API_KEY);
  }
  return _resendClient;
}

let _sesTransport: nodemailer.Transporter | null = null;
function getSESTransport(): nodemailer.Transporter | null {
  if (!HAS_SES) return null;
  if (_sesTransport) return _sesTransport;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const awsSes = require('@aws-sdk/client-ses');
    const sesClient = new awsSes.SESClient({ region: process.env.AWS_SES_REGION });
    _sesTransport = nodemailer.createTransport({
      SES: { ses: sesClient, aws: awsSes },
    } as any);
    return _sesTransport;
  } catch (err: unknown) {
    logger.warn({ err }, 'AWS SES transport init failed');
    return null;
  }
}

let _smtpTransport: nodemailer.Transporter | null = null;
function getSMTPTransport(): nodemailer.Transporter | null {
  if (!HAS_SMTP) return null;
  if (_smtpTransport) return _smtpTransport;
  const host = (process.env.SMTP_HOST || '').toLowerCase();
  const isLocal = host === 'localhost' || host === '127.0.0.1' || host === '::1';
  _smtpTransport = nodemailer.createTransport({
    host: process.env.SMTP_HOST!,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER!,
      pass: process.env.SMTP_PASS!,
    },
    // Opportunistic STARTTLS off localhost is credential theft via MITM.
    requireTLS: !isLocal,
    tls: isLocal ? undefined : { rejectUnauthorized: true, minVersion: 'TLSv1.2' },
  });
  return _smtpTransport;
}

/** Strips CR/LF/quotes so user-controlled display names can't inject headers. */
function formatRecipient(to: string, toName?: string): string {
  if (!toName) return to;
  const safeName = toName.replace(/[\r\n"]/g, '').slice(0, 120);
  if (!safeName) return to;
  return `"${safeName}" <${to}>`;
}

// ─── Primary & Fallback Transmitters ──────────────────────────────────────────

async function sendViaResend(opts: SendEmailOptions): Promise<boolean> {
  const client = getResendClient();
  if (!client) return false;

  const toAddress = opts.toName ? `"${opts.toName}" <${opts.to}>` : opts.to;
  const result = await client.emails.send({
    from: FROM_EMAIL,
    to: toAddress,
    subject: opts.subject,
    html: opts.html,
    text: opts.text,
  });

  if (result.error) {
    throw new Error(`Resend Error: ${result.error.message}`);
  }

  logger.info({ provider: 'resend', id: result.data?.id, to: opts.to }, 'Email sent');
  return true;
}

async function sendViaSES(opts: SendEmailOptions): Promise<boolean> {
  const transport = getSESTransport();
  if (!transport) return false;

  const info = await transport.sendMail({
    from: FROM_EMAIL,
    to: opts.toName ? `"${opts.toName}" <${opts.to}>` : opts.to,
    subject: opts.subject,
    html: opts.html,
    text: opts.text,
  });

  logger.info({ provider: 'ses', messageId: info.messageId, to: opts.to }, 'Email sent');
  return true;
}

async function sendViaSMTP(opts: SendEmailOptions): Promise<boolean> {
  const transport = getSMTPTransport();
  if (!transport) return false;

  const info = await transport.sendMail({
    from: FROM_EMAIL,
    to: opts.toName ? `"${opts.toName}" <${opts.to}>` : opts.to,
    subject: opts.subject,
    html: opts.html,
    text: opts.text,
  });

  logger.info({ provider: 'smtp', messageId: info.messageId, to: opts.to }, 'Email sent');
  return true;
}

function printDevModeEmail(opts: SendEmailOptions): void {
  // Dev-only preview (logger.debug is a no-op outside development).
  logger.debug(
    {
      to: opts.toName ? `"${opts.toName}" <${opts.to}>` : opts.to,
      from: FROM_EMAIL,
      subject: opts.subject,
      htmlPreview: opts.html.substring(0, 800),
    },
    'DEV MODE email preview (no provider configured)'
  );
}

// ─── sendEmail (Tier 1: Resend -> Tier 2: AWS SES -> Tier 3: SMTP -> Dev Console) ───
export async function sendEmail(opts: SendEmailOptions): Promise<void> {
  // 1. Primary: Resend
  if (HAS_RESEND) {
    try {
      const sent = await sendViaResend(opts);
      if (sent) return;
    } catch (err: unknown) {
      logger.warn({ err }, 'Resend delivery failed, falling back to AWS SES');
    }
  }

  // 2. Fallback 1: Amazon SES
  if (HAS_SES) {
    try {
      const sent = await sendViaSES(opts);
      if (sent) return;
    } catch (err: unknown) {
      logger.warn({ err }, 'AWS SES delivery failed, falling back to Personal SMTP');
    }
  }

  // 3. Fallback 2: Personal SMTP Server
  if (HAS_SMTP) {
    try {
      const sent = await sendViaSMTP(opts);
      if (sent) return;
    } catch (err: unknown) {
      logger.warn({ err }, 'Personal SMTP delivery failed, falling back to dev console');
    }
  }

  // 4. Fallback 3: Local Dev Console
  printDevModeEmail(opts);
}
