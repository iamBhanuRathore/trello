import type { ChatMessage } from './types';

/**
 * Parses markdown quote prefix if present.
 * Format 1: > **Author** [ref:UUID]: Snippet\n\nActual body
 * Format 2: > Snippet\n\nActual body
 */
export function parseQuotedMessage(body: string) {
  const fullMatch = body.match(/^>\s*\*\*([^*]+)\*\*(?:\s*\[ref:([^\]]+)\])?:\s*(.*?)\n\n(.*)$/s);
  if (fullMatch) {
    return {
      hasQuote: true,
      author: fullMatch[1],
      refId: fullMatch[2] || null,
      snippet: fullMatch[3],
      content: fullMatch[4],
    };
  }

  const simpleMatch = body.match(/^>\s*(.*?)\n\n(.*)$/s);
  if (simpleMatch) {
    return {
      hasQuote: true,
      author: 'Quoted message',
      refId: null,
      snippet: simpleMatch[1],
      content: simpleMatch[2],
    };
  }

  return {
    hasQuote: false,
    author: null,
    refId: null,
    snippet: null,
    content: body || '',
  };
}

/**
 * Detects if a comment is an automated system/activity log (e.g. checklist, watcher, status changes)
 */
export function isActivityComment(body: string): boolean {
  if (!body) return false;
  const trimmed = body.trim();
  return (
    trimmed.startsWith('📋 Added checklist') ||
    trimmed.startsWith('➕ Added checklist') ||
    trimmed.startsWith('☑️ Completed checklist') ||
    trimmed.startsWith('⬜ Marked checklist') ||
    trimmed.startsWith('🗑️ Removed checklist') ||
    trimmed.startsWith('⚡') ||
    trimmed.startsWith('📌') ||
    trimmed.startsWith('🏷️') ||
    trimmed.startsWith('👀') ||
    trimmed.startsWith('👤') ||
    trimmed.startsWith('🤝') ||
    trimmed.startsWith('🔀')
  );
}

/**
 * Formats activity text for rendering in centered system activity pills
 */
export function formatActivityText(c: ChatMessage): string {
  const author = c.authorName || c.authorEmail?.split('@')[0] || 'Teammate';
  const body = c.body.trim();

  // Strip markdown bold asterisks **text** -> text
  const cleanBody = body.replace(/\*\*(.*?)\*\*/g, '$1');

  // First line in case of multiline lists
  const firstLine = cleanBody.split('\n')[0].trim();

  // Remove leading emojis like 📋, ➕, ☑️, ⬜, 🗑️, etc. and trim.
  // NOTE: variation selectors (U+FE00–FE0F are combining marks) must not sit
  // inside the character class — match U+FE0F (the common one) separately.
  const textWithoutEmoji = firstLine
    .replace(/^(?:\uFE0F|[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F900}-\u{1F9FF}\s])+/u, '')
    .trim();

  // Lowercase initial verb: "Added checklist..." -> "added checklist..."
  const verbLower = textWithoutEmoji.charAt(0).toLowerCase() + textWithoutEmoji.slice(1);

  // Clean trailing colon if it was followed by a list
  const cleanVerb = verbLower.replace(/:$/, '');

  return `${author} ${cleanVerb}`;
}
