import React from 'react';
import { Outlet, NavLink, Link, useLocation } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { Button } from '@boardly/ui/button';
import {
  Building2,
  Menu,
  X,
  Package,
  KanbanSquare,
  LogOut,
  Users,
  LayoutDashboard,
  Server,
  ExternalLink,
} from 'lucide-react';

export const SuperAdminLayout: React.FC = () => {
  const { user, logout } = useAuthStore();
  const location = useLocation();
  // The sidebar is hidden below md and there was no mobile alternative, so
  // Tenants / Users / Plans were unreachable under 768px.
  const [isNavOpen, setIsNavOpen] = React.useState(false);

  // Close the drawer on navigation.
  React.useEffect(() => {
    setIsNavOpen(false);
  }, [location.pathname]);

  const navItems = [
    { name: 'Platform Overview', path: '/', icon: LayoutDashboard },
    { name: 'Tenant Organizations', path: '/tenants', icon: Building2 },
    { name: 'Cross-Company Users', path: '/users', icon: Users },
    { name: 'Plans & Subscriptions', path: '/plans', icon: Package },
  ];

  return (
    <div className="flex h-screen w-full flex-col bg-[#09090b] text-foreground transition-colors overflow-hidden">
      {/* Top Header */}
      <header className="shrink-0 z-30 flex h-14 items-center gap-3 border-b border-border/80 bg-card/60 backdrop-blur-md px-4 sm:px-6 py-3 shadow-xs">
        <button
          type="button"
          onClick={() => setIsNavOpen((v) => !v)}
          aria-expanded={isNavOpen}
          aria-label="Toggle navigation"
          className="md:hidden inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border/80 text-muted-foreground hover:text-foreground hover:bg-muted/60 cursor-pointer"
        >
          {isNavOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
        </button>
        <div className="flex items-center gap-2">
          <Link to="/" className="flex items-center gap-2.5 font-semibold group">
            <div className="p-1.5 rounded-xl bg-purple-500/10 border border-purple-500/30 text-purple-400 group-hover:scale-105 transition-transform">
              <KanbanSquare className="h-5 w-5" />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-base font-bold tracking-tight text-white">
                Boardly Super Admin
              </span>
              <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30">
                PLATFORM OPS
              </span>
            </div>
          </Link>
        </div>

        <div className="ml-auto flex items-center gap-3">
          {/* Cluster Status Indicator */}
          <div className="hidden md:flex items-center gap-2 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[11px] text-emerald-400 font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span>Multi-Tenant Cluster Healthy</span>
          </div>

          <a
            href="http://localhost:5173"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-medium text-muted-foreground hover:text-purple-400 flex items-center gap-1 transition-colors px-2 py-1"
          >
            <span>Open User App</span>
            <ExternalLink className="h-3 w-3" />
          </a>

          <div className="text-xs font-medium text-muted-foreground hidden sm:inline-block border-l border-border pl-3">
            <span className="text-white font-semibold">{user?.name}</span>{' '}
            <span className="text-[10px] text-purple-400">({user?.email})</span>
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => logout()}
            className="h-8 text-xs gap-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 cursor-pointer"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Sign Out</span>
          </Button>
        </div>
      </header>

      {/* Mobile nav drawer — the sidebar is hidden below md */}
      {isNavOpen && (
        <div className="md:hidden shrink-0 border-b border-border/80 bg-card/40 backdrop-blur-md">
          <nav className="flex flex-col gap-1 p-3" aria-label="Platform">
            {navItems.map((item) => {
              const isActive =
                item.path === '/'
                  ? location.pathname === '/'
                  : location.pathname.startsWith(item.path);
              const Icon = item.icon;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-purple-500/10 text-purple-400'
                      : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {item.name}
                </Link>
              );
            })}
          </nav>
        </div>
      )}

      {/* Main Content Layout */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Left Nav Sidebar */}
        <aside className="w-64 border-r border-border/80 bg-card/30 backdrop-blur-md flex flex-col justify-between p-4 hidden md:flex shrink-0">
          <div className="space-y-6">
            <div>
              <div className="text-[10px] font-bold text-muted-foreground/70 uppercase tracking-widest px-3 mb-2">
                Platform Governance
              </div>
              <nav className="space-y-1">
                {navItems.map((item) => {
                  const isActive =
                    item.path === '/'
                      ? location.pathname === '/'
                      : location.pathname.startsWith(item.path);
                  const Icon = item.icon;
                  return (
                    <NavLink
                      key={item.name}
                      to={item.path}
                      className={`flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                        isActive
                          ? 'bg-purple-600/15 text-purple-300 border border-purple-500/30 shadow-xs'
                          : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
                      }`}
                    >
                      <Icon
                        className={`w-4 h-4 ${isActive ? 'text-purple-400' : 'text-muted-foreground'}`}
                      />
                      <span>{item.name}</span>
                    </NavLink>
                  );
                })}
              </nav>
            </div>

            {/* Quick System Info Card */}
            <div className="p-3.5 rounded-2xl border border-border/60 bg-muted/20 space-y-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-white">
                <Server className="w-3.5 h-3.5 text-purple-400" />
                <span>Dedicated DB Routing</span>
              </div>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Configure enterprise tenant database connection strings and isolated PostgreSQL
                schemas.
              </p>
            </div>
          </div>

          <div className="p-3 rounded-xl border border-border/40 bg-muted/10 text-[11px] text-muted-foreground">
            <div>Boardly Super Admin v2.0</div>
            <div className="text-[10px] opacity-70">Dedicated Infrastructure Console</div>
          </div>
        </aside>

        {/* Independently Scrollable Main View */}
        <main className="flex flex-1 flex-col overflow-y-auto bg-background/50">
          <div className="w-full max-w-[1600px] mx-auto p-4 sm:p-6 lg:p-8">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
};
