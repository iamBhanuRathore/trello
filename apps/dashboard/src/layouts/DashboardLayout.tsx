import { useState } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { Button } from '@boardly/ui/button';
import {
  Plus,
  ChevronRight,
  Home,
  LogOut,
  User,
  Settings,
  Palette,
  Shield,
  ChevronDown,
  Briefcase,
  FolderPlus,
  Layout,
} from 'lucide-react';
import {
  SidebarProvider,
  SidebarInset,
  SidebarTrigger,
} from '@boardly/ui/sidebar';
import { AppSidebar } from '../components/AppSidebar';
import { NotificationDropdown } from '../components/NotificationDropdown';
import { SearchPalette } from '../components/SearchPalette';
import { ThemeToggle } from '../components/ThemeToggle';
import { TrashBinModal } from '../components/trash/TrashBinModal';
import { AppearanceModal } from '../components/AppearanceModal';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@boardly/ui/dropdown-menu';

export function DashboardLayout() {
  const { user, logout } = useAuthStore();
  const location = useLocation();
  const navigate = useNavigate();

  const [isTrashOpen, setIsTrashOpen] = useState(false);
  const [isAppearanceOpen, setIsAppearanceOpen] = useState(false);

  // Dynamic Breadcrumb computation
  const getBreadcrumbs = () => {
    const path = location.pathname;

    if (path === '/') return [{ label: 'Workspaces', to: '/' }];
    if (path === '/my-tasks' || path === '/tasks') return [{ label: 'Workspaces', to: '/' }, { label: 'My Tasks' }];
    if (path === '/timesheets') return [{ label: 'Workspaces', to: '/' }, { label: 'Timesheets' }];
    if (path === '/marketplace') return [{ label: 'Workspaces', to: '/' }, { label: 'Power-Ups & Apps' }];
    if (path === '/profile' || path === '/settings/profile') return [{ label: 'Settings', to: '/profile' }, { label: 'Profile' }];
    if (path === '/settings/notifications') return [{ label: 'Settings', to: '/profile' }, { label: 'Notifications' }];
    if (path.includes('/portfolio')) return [{ label: 'Workspaces', to: '/' }, { label: 'Portfolio Health' }];
    if (path.includes('/docs')) return [{ label: 'Workspaces', to: '/' }, { label: 'Docs & Knowledge Base' }];
    if (path.includes('/sprints')) return [{ label: 'Workspaces', to: '/' }, { label: 'Sprint Planner' }];
    if (path.includes('/phases')) return [{ label: 'Workspaces', to: '/' }, { label: 'Lifecycle Phases' }];
    if (path.includes('/reports')) return [{ label: 'Workspaces', to: '/' }, { label: 'Reports & Analytics' }];
    if (path.startsWith('/b/')) return [{ label: 'Workspaces', to: '/' }, { label: 'Kanban Board' }];
    if (path.startsWith('/cards/')) return [{ label: 'Workspaces', to: '/' }, { label: 'Task Card' }];

    return [{ label: 'Dashboard', to: '/' }];
  };

  const breadcrumbs = getBreadcrumbs();

  return (
    <SidebarProvider className="flex h-screen w-full bg-background text-foreground transition-colors overflow-hidden">
      {/* Dynamic Collapsible App Sidebar */}
      <AppSidebar
        onOpenTrash={() => setIsTrashOpen(true)}
        onOpenAppearance={() => setIsAppearanceOpen(true)}
      />

      {/* Main Content Area */}
      <SidebarInset className="flex flex-1 flex-col overflow-hidden min-h-0 bg-background">
        {/* Top Inset Bar */}
        <header className="shrink-0 z-30 flex h-14 items-center justify-between gap-3 border-b bg-background/85 backdrop-blur-md px-4 sm:px-6 shadow-2xs transition-colors">
          {/* Left: Sidebar Trigger + Breadcrumbs */}
          <div className="flex items-center gap-2.5 min-w-0">
            <SidebarTrigger className="h-8 w-8 shrink-0" />

            <div className="h-4 w-px bg-border/80 hidden sm:block shrink-0" />

            {/* Breadcrumbs */}
            <nav className="flex items-center gap-1.5 text-xs text-muted-foreground truncate">
              <Link
                to="/"
                className="hover:text-foreground flex items-center gap-1 transition-colors shrink-0"
              >
                <Home className="w-3.5 h-3.5" />
              </Link>
              {breadcrumbs.map((crumb, idx) => {
                const isLast = idx === breadcrumbs.length - 1;
                return (
                  <div key={idx} className="flex items-center gap-1.5 truncate">
                    <ChevronRight className="w-3 h-3 text-muted-foreground/60 shrink-0" />
                    {isLast || !crumb.to ? (
                      <span className="font-semibold text-foreground truncate">
                        {crumb.label}
                      </span>
                    ) : (
                      <Link
                        to={crumb.to}
                        className="hover:text-foreground transition-colors truncate"
                      >
                        {crumb.label}
                      </Link>
                    )}
                  </div>
                );
              })}
            </nav>
          </div>

          {/* Right: Search, Notifications, Theme, Fast Create, Avatar */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <SearchPalette triggerContext="navbar" />

            <NotificationDropdown />

            <ThemeToggle />

            {/* Fast Create Action Button */}
            <DropdownMenu>
              <DropdownMenuTrigger>
                <Button
                  variant="outline"
                  size="sm"
                  className="bg-primary/10 text-primary border-primary/20 hover:bg-primary/20 h-8 px-2.5 text-xs font-semibold cursor-pointer gap-1"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span className="hidden md:inline">Create</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" sideOffset={8} className="w-52 min-w-[210px] p-1.5 rounded-xl border border-border/80 shadow-lg bg-popover/95 backdrop-blur-md">
                <DropdownMenuItem
                  className="cursor-pointer text-xs font-medium px-2.5 py-2 rounded-lg gap-2.5"
                  onClick={() => navigate('/')}
                >
                  <Briefcase className="w-4 h-4 text-primary shrink-0" />
                  <span>Create Workspace</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="cursor-pointer text-xs font-medium px-2.5 py-2 rounded-lg gap-2.5"
                  onClick={() => navigate('/')}
                >
                  <FolderPlus className="w-4 h-4 text-primary shrink-0" />
                  <span>Create Project</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="cursor-pointer text-xs font-medium px-2.5 py-2 rounded-lg gap-2.5"
                  onClick={() => navigate('/')}
                >
                  <Layout className="w-4 h-4 text-primary shrink-0" />
                  <span>Create Board</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Profile Avatar Quick Menu */}
            <div className="hidden sm:flex items-center border-l pl-3 ml-1">
              <DropdownMenu>
                <DropdownMenuTrigger className="outline-none cursor-pointer">
                  <div
                    role="button"
                    tabIndex={0}
                    className="flex items-center gap-2 py-1 px-1.5 rounded-xl hover:bg-muted/70 transition-all cursor-pointer text-left focus-visible:ring-2 focus-visible:ring-primary/30"
                  >
                    {user?.avatarUrl ? (
                      <img
                        src={user.avatarUrl}
                        alt={user.name || 'User'}
                        className="w-7 h-7 rounded-full object-cover ring-1 ring-border shadow-xs shrink-0"
                      />
                    ) : (
                      <div className="w-7 h-7 rounded-full bg-primary/20 text-primary flex items-center justify-center text-xs font-bold ring-1 ring-primary/30 shrink-0">
                        {user?.name ? user.name.substring(0, 1).toUpperCase() : 'U'}
                      </div>
                    )}
                    <span className="text-xs font-semibold hidden lg:inline-block max-w-[130px] truncate text-foreground">
                      {user?.name}
                    </span>
                    <ChevronDown className="w-3.5 h-3.5 text-muted-foreground hidden lg:inline-block shrink-0 opacity-60" />
                  </div>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  sideOffset={8}
                  className="w-64 min-w-[260px] p-2 rounded-2xl border border-border/80 shadow-xl bg-popover/98 backdrop-blur-md animate-in fade-in-50 zoom-in-95 duration-150"
                >
                  {/* User Profile Card Header */}
                  <div className="flex items-center gap-3 p-2.5 rounded-xl bg-muted/40 border border-border/50 mb-1.5">
                    {user?.avatarUrl ? (
                      <img
                        src={user.avatarUrl}
                        alt={user.name || 'User'}
                        className="w-9 h-9 rounded-full object-cover ring-1 ring-border shadow-xs shrink-0"
                      />
                    ) : (
                      <div className="w-9 h-9 rounded-full bg-primary/20 text-primary flex items-center justify-center text-sm font-bold ring-1 ring-primary/30 shrink-0">
                        {user?.name ? user.name.substring(0, 1).toUpperCase() : 'U'}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-foreground truncate leading-snug">
                        {user?.name || 'User'}
                      </p>
                      <p className="text-[11px] text-muted-foreground truncate leading-snug">
                        {user?.email}
                      </p>
                      {user?.role && (
                        <span className="inline-block mt-1 px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wider bg-primary/10 text-primary border border-primary/20">
                          {user.role.replace('_', ' ')}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Menu Items */}
                  <div className="space-y-0.5">
                    <DropdownMenuItem
                      className="cursor-pointer text-xs font-medium px-2.5 py-2 rounded-lg gap-2.5 hover:bg-muted/80 transition-colors"
                      onClick={() => navigate('/profile')}
                    >
                      <User className="w-4 h-4 text-muted-foreground shrink-0" />
                      <span>Profile Settings</span>
                    </DropdownMenuItem>

                    <DropdownMenuItem
                      className="cursor-pointer text-xs font-medium px-2.5 py-2 rounded-lg gap-2.5 hover:bg-muted/80 transition-colors"
                      onClick={() => navigate('/settings/notifications')}
                    >
                      <Settings className="w-4 h-4 text-muted-foreground shrink-0" />
                      <span>Notification Preferences</span>
                    </DropdownMenuItem>

                    <DropdownMenuItem
                      className="cursor-pointer text-xs font-medium px-2.5 py-2 rounded-lg gap-2.5 hover:bg-muted/80 transition-colors"
                      onClick={() => setIsAppearanceOpen(true)}
                    >
                      <Palette className="w-4 h-4 text-muted-foreground shrink-0" />
                      <span>Theme &amp; Appearance</span>
                    </DropdownMenuItem>

                    {user?.isPlatformAdmin && (
                      <DropdownMenuItem
                        className="cursor-pointer text-xs font-medium px-2.5 py-2 rounded-lg gap-2.5 text-primary hover:bg-primary/10 transition-colors"
                        onClick={() => window.open('http://localhost:5174', '_blank')}
                      >
                        <Shield className="w-4 h-4 text-primary shrink-0" />
                        <span>Super Admin Portal</span>
                      </DropdownMenuItem>
                    )}
                  </div>

                  <DropdownMenuSeparator className="my-1.5" />

                  <DropdownMenuItem
                    variant="destructive"
                    className="cursor-pointer text-xs font-medium px-2.5 py-2 rounded-lg gap-2.5 text-destructive hover:bg-destructive/10 transition-colors"
                    onClick={() => logout()}
                  >
                    <LogOut className="w-4 h-4 text-destructive shrink-0" />
                    <span>Sign Out</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </header>

        {/* Main Viewport Content */}
        <main className="flex flex-1 flex-col p-4 md:p-6 overflow-y-auto min-h-0">
          <Outlet />
        </main>
      </SidebarInset>

      {/* Global Modals */}
      <TrashBinModal open={isTrashOpen} onOpenChange={setIsTrashOpen} />
      <AppearanceModal open={isAppearanceOpen} onOpenChange={setIsAppearanceOpen} />
    </SidebarProvider>
  );
}
