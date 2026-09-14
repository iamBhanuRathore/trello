import { useState, useMemo, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@boardly/ui/button';
import {
  Bell,
  Settings,
  CheckCheck,
  Check,
  MessageSquare,
  UserCheck,
  AtSign,
  Clock,
  Sparkles,
  ExternalLink,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { getNotifications, markNotificationAsRead, markAllNotificationsAsRead } from '@/lib/api';
import { Link, useNavigate } from 'react-router-dom';
import { QueryError } from './common/QueryError';

export function NotificationDropdown() {
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'all' | 'unread'>('all');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  // Robust click outside & escape dismiss listener
  useEffect(() => {
    if (!open) return;

    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  const {
    data: notifications = [],
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ['notifications'],
    queryFn: async () => (await getNotifications()).data,
  });

  const markAsReadMutation = useMutation({
    mutationFn: async (id: string) => (await markNotificationAsRead(id)).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const markAllAsReadMutation = useMutation({
    mutationFn: async () => (await markAllNotificationsAsRead()).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const unreadCount = notifications.filter((n: any) => !n.isRead).length;

  const filteredNotifications = useMemo(() => {
    if (activeTab === 'unread') {
      return notifications.filter((n: any) => !n.isRead);
    }
    return notifications;
  }, [notifications, activeTab]);

  const handleNotificationClick = (notif: any) => {
    // 1. Mark as read
    if (!notif.isRead) {
      markAsReadMutation.mutate(notif.id);
    }

    // 2. Navigate to relevant context
    setOpen(false);
    if (notif.payload?.boardId) {
      if (notif.payload?.cardId) {
        navigate(`/b/${notif.payload.boardId}?card=${notif.payload.cardId}`);
      } else {
        navigate(`/b/${notif.payload.boardId}`);
      }
    } else if (notif.payload?.cardId) {
      navigate('/my-tasks');
    }
  };

  const renderNotificationDetails = (notif: any) => {
    const eventType = notif.eventType || '';
    const payload = notif.payload || {};

    if (eventType === 'card.mentioned') {
      return {
        title: 'Mentioned in a Comment',
        body:
          payload.commentSnippet ||
          payload.commentText ||
          'You were mentioned in a task discussion.',
        icon: <AtSign className="h-4 w-4 text-indigo-500" />,
        bg: 'bg-indigo-500/10',
      };
    }

    if (eventType === 'card.assigned') {
      return {
        title: 'Assigned to Task',
        body: payload.cardTitle
          ? `You were assigned to "${payload.cardTitle}"`
          : 'You were assigned to a new task.',
        icon: <UserCheck className="h-4 w-4 text-emerald-500" />,
        bg: 'bg-emerald-500/10',
      };
    }

    if (eventType === 'card.commented') {
      return {
        title: 'New Comment',
        body: payload.commentText ? `"${payload.commentText}"` : 'A teammate commented on a task.',
        icon: <MessageSquare className="h-4 w-4 text-sky-500" />,
        bg: 'bg-sky-500/10',
      };
    }

    if (eventType === 'card.due_soon' || eventType === 'card.overdue') {
      return {
        title: eventType === 'card.overdue' ? 'Task Overdue' : 'Task Due Soon',
        body: payload.cardTitle
          ? `Task "${payload.cardTitle}" requires your attention.`
          : 'A task is approaching its deadline.',
        icon: <Clock className="h-4 w-4 text-amber-500" />,
        bg: 'bg-amber-500/10',
      };
    }

    // Default
    return {
      title: 'Workspace Update',
      body:
        payload.message ||
        payload.commentText ||
        payload.commentSnippet ||
        'You have a new update in your workspace.',
      icon: <Bell className="h-4 w-4 text-primary" />,
      bg: 'bg-primary/10',
    };
  };

  return (
    <div className="relative">
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setOpen(!open)}
        className="relative h-9 w-9 text-muted-foreground hover:text-foreground"
        title="Notifications"
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <span className="absolute top-1.5 right-1.5 flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500 ring-2 ring-background"></span>
          </span>
        )}
      </Button>

      {open && (
        <div
          ref={dropdownRef}
          className="absolute right-0 mt-2 w-84 sm:w-96 rounded-2xl border border-border bg-popover text-popover-foreground shadow-2xl z-50 overflow-hidden animate-in fade-in-50 zoom-in-95 duration-150"
        >
          {/* Header */}
          <div className="p-3.5 border-b border-border bg-muted/40 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="font-bold text-xs sm:text-sm text-foreground">Notifications</span>
              {unreadCount > 0 && (
                <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full bg-primary/15 text-primary">
                  {unreadCount} unread
                </span>
              )}
            </div>

            <div className="flex items-center gap-1">
              {unreadCount > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-[11px] text-muted-foreground hover:text-foreground gap-1"
                  onClick={() => markAllAsReadMutation.mutate()}
                  disabled={markAllAsReadMutation.isPending}
                  title="Mark all notifications as read"
                >
                  <CheckCheck className="w-3.5 h-3.5" />
                  <span>Mark all read</span>
                </Button>
              )}

              <Link to="/settings/notifications" onClick={() => setOpen(false)}>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-foreground"
                  title="Notification Preferences"
                >
                  <Settings className="h-3.5 w-3.5" />
                </Button>
              </Link>
            </div>
          </div>

          {/* Filter Tabs */}
          <div className="px-3.5 py-2 border-b border-border/60 bg-muted/20 flex items-center gap-1 text-xs">
            <button
              className={`px-2.5 py-1 rounded-lg font-medium transition-all cursor-pointer ${
                activeTab === 'all'
                  ? 'bg-primary/10 text-primary font-semibold'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
              }`}
              onClick={() => setActiveTab('all')}
            >
              All ({notifications.length})
            </button>
            <button
              className={`px-2.5 py-1 rounded-lg font-medium transition-all cursor-pointer ${
                activeTab === 'unread'
                  ? 'bg-primary/10 text-primary font-semibold'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
              }`}
              onClick={() => setActiveTab('unread')}
            >
              Unread ({unreadCount})
            </button>
          </div>

          {/* Notification List */}
          <div className="max-h-[380px] overflow-y-auto divide-y divide-border/60 bg-popover">
            {isLoading ? (
              <div className="p-8 text-center text-xs text-muted-foreground">
                Loading notifications...
              </div>
            ) : isError && notifications.length === 0 ? (
              <QueryError
                compact
                message="Couldn't load notifications."
                onRetry={() => refetch()}
                className="p-4 justify-center"
              />
            ) : filteredNotifications.length === 0 ? (
              <div className="p-8 text-center space-y-2">
                <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center mx-auto text-muted-foreground">
                  <Sparkles className="w-4 h-4 text-primary" />
                </div>
                <div className="text-xs font-semibold text-foreground">
                  {activeTab === 'unread' ? 'No unread notifications' : 'No notifications yet'}
                </div>
                <p className="text-[11px] text-muted-foreground max-w-xs mx-auto">
                  {activeTab === 'unread'
                    ? 'You are completely caught up with all team activities.'
                    : 'When teammates mention you, assign tasks, or comment, updates will appear here.'}
                </p>
              </div>
            ) : (
              filteredNotifications.map((notif: any) => {
                const details = renderNotificationDetails(notif);
                return (
                  <div
                    key={notif.id}
                    className={`p-3 text-xs transition-colors flex items-start justify-between gap-2.5 group cursor-pointer ${
                      !notif.isRead
                        ? 'bg-primary/5 hover:bg-primary/10'
                        : 'hover:bg-muted/40 opacity-90'
                    }`}
                    onClick={() => handleNotificationClick(notif)}
                  >
                    <div className="flex items-start gap-2.5 min-w-0">
                      <div className={`p-1.5 rounded-lg shrink-0 mt-0.5 ${details.bg}`}>
                        {details.icon}
                      </div>
                      <div className="min-w-0 space-y-0.5">
                        <div className="flex items-center gap-1.5">
                          <span className="font-semibold text-foreground truncate">
                            {details.title}
                          </span>
                          {!notif.isRead && (
                            <span className="h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                          )}
                        </div>
                        <p className="text-muted-foreground line-clamp-2 text-[11px] leading-relaxed">
                          {details.body}
                        </p>
                        <div className="text-[10px] text-muted-foreground/80 pt-0.5">
                          {formatDistanceToNow(new Date(notif.createdAt), { addSuffix: true })}
                        </div>
                      </div>
                    </div>

                    {/* Quick Dismiss / Mark as Read */}
                    <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                      {!notif.isRead ? (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-6 w-6 text-muted-foreground hover:text-primary"
                          title="Mark as read"
                          onClick={(e) => {
                            e.stopPropagation();
                            markAsReadMutation.mutate(notif.id);
                          }}
                        >
                          <Check className="h-3.5 w-3.5" />
                        </Button>
                      ) : (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-6 w-6 text-muted-foreground"
                          title="Open"
                        >
                          <ExternalLink className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Footer */}
          <div className="p-2.5 border-t border-border bg-muted/30 text-center text-[10px] text-muted-foreground">
            Click a notification to open the task details
          </div>
        </div>
      )}
    </div>
  );
}
