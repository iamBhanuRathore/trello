import PostalMime, { type Attachment, type Email } from 'postal-mime';

// RFC 2822 / MIME parsing for inbound email (4.6b), delegated to `postal-mime`
// (the same library Thunderbird/Thunderbird-derived tooling standardises on) so
// nested multipart, RFC 2047 encoded-words, base64/quoted-printable, and
// address parsing are handled by a maintained parser instead of hand-rolled
// regex. Only the subset the forwarder path needs is projected onto ParsedEmail.

export interface ParsedAttachment {
  filename: string;
  mime: string;
  bytes: Uint8Array;
}

export interface ParsedEmail {
  headers: Map<string, string>;
  from: string;
  to: string[];
  subject: string;
  messageId: string | null;
  inReplyTo: string | null;
  references: string[];
  textBody: string;
  htmlBody: string | null;
  attachments: ParsedAttachment[];
}

export const MAX_ATTACHMENTS = 10;

function toBytes(content: Attachment['content']): Uint8Array {
  if (content instanceof Uint8Array) return content;
  if (typeof content === 'string') return new TextEncoder().encode(content);
  return new Uint8Array(content);
}

function mailboxAddresses(email: Email): string[] {
  const out: string[] = [];
  for (const list of [email.to ?? [], email.cc ?? []]) {
    for (const addr of list) {
      if ('address' in addr && addr.address) out.push(addr.address.toLowerCase());
    }
  }
  return out;
}

function htmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_m, d: string) => String.fromCharCode(Number(d)))
    .trim();
}

/**
 * Parse a raw RFC822 message. Never throws on malformed input: a failed parse
 * degrades to whatever `postal-mime` recovered, so a single bad message cannot
 * take down the receive path.
 */
export async function parseRawEmail(raw: string): Promise<ParsedEmail> {
  let email: Email;
  try {
    email = await PostalMime.parse(raw, { attachmentEncoding: 'arraybuffer' });
  } catch {
    // Last-resort: a single-header-block read so a truncated message still
    // records From/Subject instead of vanishing.
    const head = raw.split(/\r?\n\r?\n/)[0] || '';
    const headers = new Map<string, string>();
    for (const line of head.split(/\r?\n/)) {
      const sep = line.indexOf(':');
      if (sep > 0 && !/^[ \t]/.test(line)) {
        headers.set(line.slice(0, sep).trim().toLowerCase(), line.slice(sep + 1).trim());
      }
    }
    return {
      headers,
      from: (headers.get('from') || '').replace(/<|>/g, '').trim().toLowerCase(),
      to: (headers.get('to') || '')
        .split(',')
        .map((s) => s.replace(/<|>/g, '').trim().toLowerCase())
        .filter(Boolean),
      subject: (headers.get('subject') || '').slice(0, 500),
      messageId: headers.get('message-id') || null,
      inReplyTo: headers.get('in-reply-to') || null,
      references: (headers.get('references') || '').split(/\s+/).filter(Boolean),
      textBody: '',
      htmlBody: null,
      attachments: [],
    };
  }

  const headers = new Map<string, string>();
  for (const h of email.headers) headers.set(h.key.toLowerCase(), h.value);

  const from =
    'address' in (email.from ?? {}) ? (email.from as { address?: string }).address : undefined;
  const textBody = (email.text ?? '').trim();
  const htmlBody = email.html?.trim() || null;

  const references = (email.references || '')
    .split(/\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

  return {
    headers,
    from: (from || '').toLowerCase(),
    to: mailboxAddresses(email),
    subject: (email.subject || '').slice(0, 500),
    messageId: email.messageId || null,
    inReplyTo: email.inReplyTo || null,
    references,
    textBody: textBody || (htmlBody ? htmlToText(htmlBody) : ''),
    htmlBody,
    attachments: (email.attachments ?? []).slice(0, MAX_ATTACHMENTS).map((a) => ({
      filename: (a.filename || 'attachment').slice(0, 255),
      mime: a.mimeType || 'application/octet-stream',
      bytes: toBytes(a.content),
    })),
  };
}

/**
 * Heuristic quote/signature strip: quoted `>` lines, Gmail-style
 * "On … wrote:" blocks, `-- ` signatures, and `___` separators.
 */
export function stripQuotedReply(text: string): string {
  const lines = text.split('\n');
  const out: string[] = [];
  for (const line of lines) {
    const t = line.trim();
    if (/^--\s?$/.test(t)) break;
    if (/^_{3,}$/.test(t)) break;
    if (/^On .+ wrote:$/.test(t)) break;
    if (/^From: .+$/i.test(t) && out.length > 0) break;
    if (t.startsWith('>')) continue;
    out.push(line);
  }
  // Drop trailing empty lines left by the strip.
  while (out.length > 0 && !out[out.length - 1]!.trim()) out.pop();
  return out.join('\n').trim();
}

/** Autoresponder / loop guard: true when this mail must never create content. */
export function isAutoMail(headers: Map<string, string>, from: string): boolean {
  const autoSubmitted = (headers.get('auto-submitted') || 'no').toLowerCase();
  if (autoSubmitted !== 'no') return true;
  const precedence = (headers.get('precedence') || '').toLowerCase();
  if (['bulk', 'list', 'junk'].includes(precedence)) return true;
  if (/mailer-daemon|noreply|no-reply|donotreply|postmaster/i.test(from)) return true;
  if ((headers.get('x-auto-response-suppress') || '').length > 0) return true;
  return false;
}
