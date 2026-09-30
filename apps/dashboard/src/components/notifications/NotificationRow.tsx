import { memo } from 'react';
import { Link } from 'react-router-dom';
import {
  AtSign,
  Bell,
  Check,
  Archive,
  ArchiveRestore,
  Clock,
  MailOpen,
  MessageSquare,
  Star,
  UserCheck,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { Button } from '@boardly/ui/button';
import { getAvatarGradient, getInitials } from '../../utils/avatar';
import { notificationTarget, type NotificationItem } from '../../lib/notifications';
import {
  useBulkArchiveNotifications,
  useBulkUnarchiveNotifications,
  useToggleNotificationStar,
  useToggleNotificationUnread,
} from '../../hooks/useNotifications';

interface RowPresentation {
  action: string;
  icon: React.ReactNode;
  bg: string;
}

function presentation(n: NotificationItem): RowPresentation {
  const t = n.eventType;
  if (t === 'card.mentioned' || t === 'chat.mentioned')
    return {
      action: t === 'chat.mentioned' ? 'mentioned you in chat' : 'mentioned you',
      icon: <AtSign className="h-4 w-4 text-indigo-500" />,
      bg: 'bg-indigo-500/10',
    };
  if (t === 'card.assigned')
    return {
      action: 'assigned you',
      icon: <UserCheck className="h-4 w-4 text-emerald-500" />,
      bg: 'bg-emerald-500/10',
    };
  if (t === 'card.commented')
    return {
      action: 'commented',
      icon: <MessageSquare className="h-4 w-4 text-sky-500" />,
      bg: 'bg-sky-500/10',
    };
  if (t === 'card.due_soon' || t === 'card.overdue')
    return {
      action: t === 'card.overdue' ? 'is overdue' : 'is due soon',
      icon: <Clock className="h-4 w-4 text-amber-500" />,
      bg: 'bg-amber-500/10',
    };
  return {
    action: 'updated',
    icon: <Bell className="h-4 w-4 text-primary" />,
    bg: 'bg-primary/10',
  };
}

/** Plain-text snippet from the payload — never rendered as HTML. */
function snippet(n: NotificationItem, maxLen = 200): string {
  const p = n.payload ?? {};
  const raw =
    (typeof p.commentText === 'string' && p.commentText) ||
    (typeof p.commentSnippet === 'string' && p.commentSnippet) ||
    (typeof p.messagePreview === 'string' && p.messagePreview) ||
    '';
  const plain = raw.replace(/\s+/g, ' ').trim();
  return plain.length > maxLen ? `${plain.slice(0, maxLen - 1).trimEnd()}…` : plain;
}

export interface NotificationRowProps {
  notification: NotificationItem;
  variant?: 'full' | 'compact';
  selectMode?: boolean;
  selected?: boolean;
  onToggleSelect?: (id: string) => void;
  /** Parent navigation (marks read, then routes). Defaults to plain link. */
  onOpen?: (n: NotificationItem) => void;
}

function NotificationRowInner({
  notification: n,
  variant = 'full',
  selectMode = false,
  selected = false,
  onToggleSelect,
  onOpen,
}: NotificationRowProps) {
  const toggleUnread = useToggleNotificationUnread();
  const toggleStar = useToggleNotificationStar();
  const archive = useBulkArchiveNotifications();
  const unarchive = useBulkUnarchiveNotifications();

  const p = n.payload ?? {};
  const pres = presentation(n);
  const target = notificationTarget(n);
  const body = snippet(n, variant === 'compact' ? 120 : 200);
  const actor = typeof p.actorName === 'string' && p.actorName ? p.actorName : null;
  const cardTitle = typeof p.cardTitle === 'string' ? p.cardTitle : null;
  const cardKey = typeof p.cardKey === 'string' ? p.cardKey : null;
  const boardTitle = typeof p.boardTitle === 'string' ? p.boardTitle : null;
  const channelName = typeof p.channelName === 'string' ? p.channelName : null;
  const archived = n.archivedAt !== null;
  const created = new Date(n.createdAt);

  const handleOpen = () => onOpen?.(n);

  const main = (
    <div className="flex min-w-0 flex-1 items-start gap-2.5 sm:gap-3">
      {selectMode && (
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onToggleSelect?.(n.id)}
          onClick={(e) => e.stopPropagation()}
          aria-label={`Select notification about ${cardTitle ?? n.eventType}`}
          className="mt-1.5 h-4 w-4 shrink-0 cursor-pointer accent-primary"
        />
      )}
      {p.actorAvatarUrl ? (
        <img
          src={p.actorAvatarUrl}
          alt=""
          aria-hidden
          className="h-8 w-8 shrink-0 rounded-full object-cover"
          loading="lazy"
        />
      ) : (
        <span
          aria-hidden
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-[11px] font-bold ${getAvatarGradient(actor ?? n.eventType)}`}
        >
          {getInitials(actor ?? undefined)}
        </span>
      )}
      <div className="min-w-0 flex-1 space-y-0.5">
        <p className="text-xs leading-snug text-muted-foreground sm:text-[13px]">
          {actor && <span className="font-semibold text-foreground">{actor} </span>}
          <span>{pres.action}</span>
          {!actor && <span className="font-semibold text-foreground"> Workspace update</span>}
          {!n.isRead && (
            <span
              aria-label="Unread"
              className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-primary align-middle"
            />
          )}
          {n.isStarred && (
            <Star
              aria-label="Starred"
              className="ml-1.5 inline h-3 w-3 fill-amber-400 text-amber-400 align-[-1px]"
            />
          )}
        </p>
        {(cardTitle || cardKey) && (
          <p className="truncate text-xs font-semibold text-foreground sm:text-[13px]">
            {cardKey && (
              <span className="mr-1.5 font-mono text-[11px] text-primary">{cardKey}</span>
            )}
            {cardTitle}
          </p>
        )}
        {body && (
          <p className="line-clamp-2 text-[11px] leading-relaxed text-muted-foreground sm:text-xs">
            {body}
          </p>
        )}
        <p className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-muted-foreground/80 sm:text-[11px]">
          {boardTitle && <span className="truncate">in {boardTitle}</span>}
          {channelName && <span className="truncate">in #{channelName}</span>}
          <time
            dateTime={Number.isNaN(created.getTime()) ? undefined : created.toISOString()}
            title={Number.isNaN(created.getTime()) ? undefined : created.toLocaleString()}
            className="shrink-0 tabular-nums"
          >
            {Number.isNaN(created.getTime())
              ? ''
              : formatDistanceToNow(created, { addSuffix: true })}
          </time>
        </p>
      </div>
    </div>
  );

  const actions = (
    <div
      className="flex shrink-0 items-center gap-0.5 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:focus-within:opacity-100"
      onClick={(e) => e.stopPropagation()}
    >
      <Button
        size="icon"
        variant="ghost"
        className="h-8 w-8 text-muted-foreground hover:text-amber-500"
        title={n.isStarred ? 'Unstar' : 'Star as important (s)'}
        aria-label={n.isStarred ? 'Unstar notification' : 'Star notification as important'}
        aria-pressed={n.isStarred}
        onClick={() => toggleStar.mutate({ id: n.id, starred: !n.isStarred })}
      >
        <Star className={`h-3.5 w-3.5 ${n.isStarred ? 'fill-amber-400 text-amber-400' : ''}`} />
      </Button>
      <Button
        size="icon"
        variant="ghost"
        className="h-8 w-8 text-muted-foreground hover:text-foreground"
        title={n.isRead ? 'Mark as unread (u)' : 'Mark as read (u)'}
        aria-label={n.isRead ? 'Mark notification as unread' : 'Mark notification as read'}
        onClick={() => toggleUnread.mutate({ id: n.id, isRead: n.isRead })}
      >
        {n.isRead ? <MailOpen className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" />}
      </Button>
      {archived ? (
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8 text-muted-foreground hover:text-foreground"
          title="Unarchive"
          aria-label="Unarchive notification"
          onClick={() => unarchive.mutate([n.id])}
        >
          <ArchiveRestore className="h-3.5 w-3.5" />
        </Button>
      ) : (
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8 text-muted-foreground hover:text-foreground"
          title="Archive (e)"
          aria-label="Archive notification"
          onClick={() => archive.mutate([n.id])}
        >
          <Archive className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  );

  return (
    <div
      className={`group flex items-start justify-between gap-2 px-3 py-2.5 transition-colors sm:px-4 sm:py-3 ${
        selected
          ? 'bg-primary/10'
          : !n.isRead
            ? 'bg-primary/[0.04] hover:bg-primary/[0.07]'
            : 'hover:bg-muted/40'
      }`}
    >
      {target ? (
        <Link
          to={target}
          onClick={handleOpen}
          className="flex min-w-0 flex-1 rounded-md focus-visible:outline-2 focus-visible:outline-primary"
        >
          {main}
        </Link>
      ) : (
        <div className="flex min-w-0 flex-1" onClick={handleOpen}>
          {main}
        </div>
      )}
      <div
        className={`flex shrink-0 items-start gap-1 pt-0.5 ${variant === 'compact' ? '[&>div]:gap-0' : ''}`}
      >
        <div className={`hidden shrink-0 items-center rounded-lg p-1 sm:flex ${pres.bg}`}>
          {pres.icon}
        </div>
        {actions}
      </div>
    </div>
  );
}

export const NotificationRow = memo(NotificationRowInner);
