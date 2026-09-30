import { api } from './api';

// ─── Shared Notification Center types (mirror backend service shapes) ────────

export type NotificationArchivedFilter = 'exclude' | 'only' | 'include';

export interface NotificationPayload {
  cardId?: string | null;
  cardTitle?: string | null;
  cardKey?: string | null;
  boardId?: string | null;
  boardTitle?: string | null;
  channelId?: string | null;
  channelName?: string | null;
  messagePreview?: string | null;
  commentText?: string | null;
  commentSnippet?: string | null;
  actorId?: string | null;
  actorName?: string | null;
  actorAvatarUrl?: string | null;
  [key: string]: unknown;
}

export interface NotificationItem {
  id: string;
  userId: string;
  organizationId: string;
  eventType: string;
  payload: NotificationPayload;
  isRead: boolean;
  readAt: string | null;
  isStarred: boolean;
  archivedAt: string | null;
  searchText: string;
  createdAt: string;
  isImportant: boolean;
}

export interface NotificationFilters {
  unreadOnly?: boolean;
  starredOnly?: boolean;
  importantOnly?: boolean;
  archived?: NotificationArchivedFilter;
  types?: string[];
  q?: string;
}

export interface NotificationPage {
  items: NotificationItem[];
  nextCursor: string | null;
}

export interface NeedsAction {
  items: NotificationItem[];
  total: number;
}

export const NOTIFICATION_TYPE_FILTERS = [
  { id: 'card.mentioned', label: 'Mentions' },
  { id: 'card.assigned', label: 'Assigned' },
  { id: 'card.commented', label: 'Comments' },
  { id: 'card.due_soon', label: 'Due soon' },
  { id: 'card.overdue', label: 'Overdue' },
  { id: 'chat.mentioned', label: 'Chat' },
] as const;

// ─── API ─────────────────────────────────────────────────────────────────────

function toQueryString(
  filters: NotificationFilters,
  limit: number,
  cursor?: string | null
): string {
  const params = new URLSearchParams();
  params.set('limit', String(limit));
  if (cursor) params.set('cursor', cursor);
  if (filters.unreadOnly) params.set('unreadOnly', 'true');
  if (filters.starredOnly) params.set('starredOnly', 'true');
  if (filters.importantOnly) params.set('importantOnly', 'true');
  // Default `exclude` is the server default — omit it to keep URLs clean.
  if (filters.archived && filters.archived !== 'exclude') params.set('archived', filters.archived);
  for (const t of filters.types ?? []) params.append('types', t);
  const q = filters.q?.trim();
  if (q) params.set('q', q);
  return params.toString();
}

export async function fetchNotifications(
  filters: NotificationFilters,
  limit: number,
  cursor?: string | null
): Promise<NotificationPage> {
  const { data } = await api.get(`/notifications?${toQueryString(filters, limit, cursor)}`);
  return {
    items: Array.isArray(data) ? data : (data.items ?? []),
    nextCursor: Array.isArray(data) ? null : (data.nextCursor ?? null),
  };
}

export async function fetchNeedsAction(limit = 5): Promise<NeedsAction> {
  const { data } = await api.get(`/notifications/needs-action?limit=${limit}`);
  return { items: data.items ?? [], total: data.total ?? 0 };
}

export async function fetchUnreadCount(): Promise<number> {
  const { data } = await api.get('/notifications/unread-count');
  return data.unreadCount ?? 0;
}

export async function markNotificationRead(id: string): Promise<void> {
  await api.patch(`/notifications/${id}/read`);
}

export async function markNotificationUnread(id: string): Promise<void> {
  await api.patch(`/notifications/${id}/unread`);
}

export async function starNotification(id: string, starred: boolean): Promise<void> {
  await api.patch(`/notifications/${id}/star`, { starred });
}

export async function bulkMarkNotificationsRead(ids: string[]): Promise<{ affected: number }> {
  const { data } = await api.post('/notifications/read-many', { ids });
  return data;
}

export async function bulkArchiveNotifications(ids: string[]): Promise<{ affected: number }> {
  const { data } = await api.post('/notifications/archive-many', { ids });
  return data;
}

export async function bulkUnarchiveNotifications(ids: string[]): Promise<{ affected: number }> {
  const { data } = await api.post('/notifications/unarchive-many', { ids });
  return data;
}

export async function markAllNotificationsRead(): Promise<void> {
  await api.post('/notifications/read-all');
}

/** Deep-link target for a notification — null when there is nowhere to go. */
export function notificationTarget(n: NotificationItem): string | null {
  const p = n.payload ?? {};
  if (p.channelId) return `/chat/${p.channelId}`;
  if (p.boardId) {
    if (p.cardId) return `/b/${p.boardId}?card=${p.cardId}`;
    return `/b/${p.boardId}`;
  }
  if (p.cardId) return '/my-tasks';
  return null;
}
