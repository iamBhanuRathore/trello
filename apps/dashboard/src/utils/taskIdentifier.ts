/**
 * Generates a clean, user-friendly, human-readable, and strictly sequential incremental
 * Task Identifier (e.g., 'CFP-1', 'CFP-2', 'ENG-142', 'PROJ-10') following Jira / Linear standards.
 */
export function getTaskIdentifier(
  card?: {
    id?: string;
    key?: string | null;
    taskNumber?: number | null;
    projectKey?: string | null;
    boardName?: string | null;
    projectName?: string | null;
  } | null
): string {
  if (!card) return 'TASK-1';

  // 1. If backend has already computed the sequential key (e.g. 'CFP-1', 'BCW-5')
  if (card.key && typeof card.key === 'string' && card.key.includes('-')) {
    return card.key;
  }

  // 2. If projectKey and taskNumber are present
  if (card.projectKey && card.taskNumber) {
    return `${card.projectKey}-${card.taskNumber}`;
  }

  // 3. Fallback prefix derivation from board / project name
  const nameSource = card.projectName || card.boardName || 'Task';
  const cleanWords = nameSource
    .replace(/[^a-zA-Z0-9\s]/g, '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  let prefix = card.projectKey || 'TASK';
  if (!card.projectKey) {
    if (cleanWords.length >= 2) {
      prefix = cleanWords
        .slice(0, 3)
        .map((w) => w[0].toUpperCase())
        .join('');
    } else if (cleanWords.length === 1 && cleanWords[0].length >= 2) {
      prefix = cleanWords[0].slice(0, 3).toUpperCase();
    }
  }

  if (card.taskNumber) {
    return `${prefix}-${card.taskNumber}`;
  }

  // 4. Fallback if card ID is present
  if (card.id) {
    const uuidSegment = card.id.replace(/-/g, '').slice(0, 4).toUpperCase();
    return `${prefix}-${uuidSegment}`;
  }

  return `${prefix}-1`;
}

/**
 * Generates a clean git branch name for developers from task ID and title
 * Example: 'feature/bcw-704d-add-rate-limiting-header'
 */
export function getGitBranchName(taskIdentifier: string, title?: string): string {
  const cleanTitle = (title || 'task')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 35);

  return `feature/${taskIdentifier.toLowerCase()}-${cleanTitle}`;
}

/**
 * Generates a Markdown reference link
 * Example: '[BCW-704D: Implement Rate Limiting](https://app.boardly.dev/cards/123)'
 */
export function getMarkdownLink(taskIdentifier: string, title?: string, url?: string): string {
  const shareUrl = url || (typeof window !== 'undefined' ? window.location.href : '');
  return `[${taskIdentifier}: ${title || 'Task'}](${shareUrl})`;
}

/**
 * Copies text to clipboard safely
 */
export async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.opacity = '0';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    const successful = document.execCommand('copy');
    document.body.removeChild(textArea);
    return successful;
  } catch {
    return false;
  }
}
