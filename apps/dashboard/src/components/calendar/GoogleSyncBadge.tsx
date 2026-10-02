import { CalendarDays, Link2, Unlink, RefreshCw } from 'lucide-react';

interface GoogleSyncBadgeProps {
  googleStatus?: { configured: boolean; connected: boolean; connection?: any };
  onConnect: () => void;
  onDisconnect: () => void;
  onSync: () => void;
  isSyncing: boolean;
}

export function GoogleSyncBadge({
  googleStatus,
  onConnect,
  onDisconnect,
  onSync,
  isSyncing,
}: GoogleSyncBadgeProps) {
  if (!googleStatus) return null;
  if (!googleStatus.configured) {
    return (
      <span
        title="Set GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / CALENDAR_TOKEN_KEY to enable"
        className="hidden md:inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-border text-[11px] text-muted-foreground"
      >
        <CalendarDays className="w-3.5 h-3.5" />
        Google sync off
      </span>
    );
  }
  if (!googleStatus.connected) {
    return (
      <button
        type="button"
        onClick={onConnect}
        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90 transition-all cursor-pointer shadow-sm"
      >
        <Link2 className="w-3.5 h-3.5" />
        Connect Google
      </button>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 pl-2.5 pr-1 py-1 rounded-xl border border-emerald-500/30 bg-emerald-500/5 text-[11px]">
      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
      <span className="font-semibold text-emerald-700 dark:text-emerald-400 max-w-[140px] truncate hidden sm:inline">
        {googleStatus.connection?.email || 'Google connected'}
      </span>
      <button
        type="button"
        onClick={onSync}
        disabled={isSyncing}
        title="Sync now (pull events, push scheduled tasks)"
        className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer disabled:opacity-50"
      >
        <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
      </button>
      <button
        type="button"
        onClick={onDisconnect}
        title="Disconnect Google Calendar"
        className="p-1 rounded-lg text-muted-foreground hover:text-rose-500 hover:bg-rose-500/10 transition-colors cursor-pointer"
      >
        <Unlink className="w-3.5 h-3.5" />
      </button>
    </span>
  );
}
