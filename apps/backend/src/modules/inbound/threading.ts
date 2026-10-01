import type { Database } from '../../db/index';
import { users, cards, notificationPreferences } from '../../db/schema/index';
import { eq, and } from 'drizzle-orm';
import { sendEmail } from '../../lib/email';
import { renderCommentEmail, renderMentionEmail } from '../../lib/emailTemplates';
import { logger } from '../../lib/logger';
import { ensureCardInboundToken } from './tokens';
import { cardMessageId, boardReplyTo, inboundDomain } from './service';

// ─── Outbound threading (4.6b) ───────────────────────────────────────────────
// Notification mail for a card is the *entry point* of the reply loop: its
// Reply-To carries the card's inbound capability and its Message-ID is the
// thread anchor, so replying straight from the MUA becomes a comment on that
// card (see service.processInboundEmail). Skip silently when the threading
// secret is absent — email still sends unthreaded rather than failing the fan-out.

const PREVIEW_LIMIT = 600;

function stripHtml(text: string): string {
  return text
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
}

export interface ThreadedCardEmailInput {
  organizationId: string;
  cardId: string;
  recipientUserId: string;
  actorId: string;
  commentText?: string | null;
  event: 'card.commented' | 'card.mentioned';
}

export async function sendThreadedCardEmail(
  db: Database,
  input: ThreadedCardEmailInput
): Promise<boolean> {
  const [card] = await db
    .select({ id: cards.id, title: cards.title, key: cards.key })
    .from(cards)
    .where(and(eq(cards.id, input.cardId), eq(cards.organizationId, input.organizationId)))
    .limit(1);
  if (!card) return false;

  const [recipient] = await db
    .select({ email: users.email, name: users.name })
    .from(users)
    .where(eq(users.id, input.recipientUserId))
    .limit(1);
  if (!recipient?.email) return false;
  const [actor] = await db
    .select({ name: users.name })
    .from(users)
    .where(eq(users.id, input.actorId))
    .limit(1);

  const token = await ensureCardInboundToken(db, input.organizationId, input.cardId, input.actorId);
  if (!token) {
    logger.debug(
      { cardId: input.cardId },
      'Threaded card email skipped (INBOUND_TOKEN_SECRET unset)'
    );
    return false;
  }

  const appUrl = process.env['APP_URL'] || process.env['API_URL'] || 'http://localhost:5173';
  const preview = stripHtml(input.commentText || '').slice(0, PREVIEW_LIMIT);
  const rendered =
    input.event === 'card.mentioned'
      ? renderMentionEmail({
          cardKey: card.key,
          cardTitle: card.title,
          actorName: actor?.name || 'A teammate',
          cardUrl: `${appUrl}/cards/${input.cardId}`,
          commentText: preview || '(no text)',
          replyTo: boardReplyTo(token),
          messageId: cardMessageId(input.cardId),
        })
      : renderCommentEmail({
          cardKey: card.key,
          cardTitle: card.title,
          actorName: actor?.name || 'A teammate',
          cardUrl: `${appUrl}/cards/${input.cardId}`,
          commentText: preview || '(no text)',
          replyTo: boardReplyTo(token),
          messageId: cardMessageId(input.cardId),
        });

  await sendEmail({
    to: recipient.email,
    toName: recipient.name,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
    headers: {
      ...rendered.headers,
      // Angle brackets are required on Message-ID; our templates emit the bare id.
      'Message-ID': `<${cardMessageId(input.cardId)}>`,
      References: `<${cardMessageId(input.cardId)}>`,
      'X-Boardly-Inbound': inboundDomain(),
    },
  });
  return true;
}
/**
 * Email-channel gate mirroring the notification listener's default (no row =
 * instant). Call sites that create notification rows directly (mention
 * fan-out) use this so mention mail honours quiet hours/digest prefs.
 */
export async function emailChannelAllowed(
  db: Database,
  organizationId: string,
  userId: string,
  eventType: string
): Promise<boolean> {
  const [pref] = await db
    .select({
      frequency: notificationPreferences.frequency,
      quietHoursStart: notificationPreferences.quietHoursStart,
      quietHoursEnd: notificationPreferences.quietHoursEnd,
    })
    .from(notificationPreferences)
    .where(
      and(
        eq(notificationPreferences.organizationId, organizationId),
        eq(notificationPreferences.userId, userId),
        eq(notificationPreferences.eventType, eventType),
        eq(notificationPreferences.channel, 'email')
      )
    )
    .limit(1);
  if (!pref) return true;
  if (pref.frequency !== 'instant') return false;
  const { quietHoursStart: start, quietHoursEnd: end } = pref;
  if (start === null || end === null || start === undefined || end === undefined) return true;
  const hour = new Date().getHours();
  if (start <= end) return hour < start || hour >= end;
  return hour >= start && hour < end;
}
