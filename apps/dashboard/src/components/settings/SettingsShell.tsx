import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { UserRound, BellRing } from 'lucide-react';

const SETTINGS_NAV = [
  {
    to: '/profile',
    label: 'Profile',
    description: 'Personal details & account',
    icon: UserRound,
    match: ['/profile', '/settings/profile'],
  },
  {
    to: '/settings/notifications',
    label: 'Notifications',
    description: 'Quiet hours & channels',
    icon: BellRing,
    match: ['/settings/notifications'],
  },
];

function isNavActive(item: (typeof SETTINGS_NAV)[number], pathname: string) {
  return item.match.some((p) => pathname === p || pathname.startsWith(p + '/'));
}

/**
 * Secondary sidebar shell for user settings pages. Sticky sub-nav on desktop,
 * horizontal pills on mobile — same content component, no route changes.
 */
export function SettingsShell({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation();
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 md:flex-row">
      <nav
        aria-label="Settings sections"
        className="flex shrink-0 gap-1.5 overflow-x-auto pb-1 md:sticky md:top-4 md:w-60 md:flex-col md:self-start md:pb-0"
      >
        {SETTINGS_NAV.map((item) => {
          const active = isNavActive(item, pathname);
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              aria-current={active ? 'page' : undefined}
              className={`group flex min-w-0 items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-all md:w-full ${
                active
                  ? 'border-primary/30 bg-primary/10 text-foreground shadow-xs'
                  : 'border-transparent text-muted-foreground hover:bg-muted/60 hover:text-foreground'
              }`}
            >
              <span
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors ${
                  active
                    ? 'bg-primary/15 text-primary'
                    : 'bg-muted/60 text-muted-foreground group-hover:text-foreground'
                }`}
              >
                <Icon className="h-4 w-4" />
              </span>
              <span className="hidden min-w-0 sm:block md:block">
                <span className="block truncate text-xs font-semibold">{item.label}</span>
                <span className="block truncate text-[11px] text-muted-foreground">
                  {item.description}
                </span>
              </span>
            </NavLink>
          );
        })}
      </nav>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

/**
 * Route-layout version: wraps an <Outlet/> so every settings route —
 * including loading and error states — shares the sub-sidebar.
 */
export function SettingsLayout() {
  return (
    <SettingsShell>
      <Outlet />
    </SettingsShell>
  );
}
