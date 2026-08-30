import React, { useState } from 'react';
import { Outlet, NavLink, Link, useLocation } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { Button } from '@boardly/ui/button';
import {
  SidebarProvider,
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarRail,
  SidebarInset,
  SidebarTrigger,
} from '@boardly/ui/sidebar';
import { NotificationDropdown } from '../components/NotificationDropdown';
import { ThemeToggle } from '../components/ThemeToggle';
import { SearchPalette } from '../components/SearchPalette';
import { AppearanceModal } from '../components/AppearanceModal';
import { UserProfileDropdown } from '../components/UserProfileDropdown';
import {
  Users,
  CreditCard,
  Palette,
  ShieldAlert,
  LayoutDashboard as Trello,
  ArrowLeft,
  Workflow,
  Shield,
  FileText,
  Webhook,
  Layers,
  KeyRound,
  Code,
  Tag,
} from 'lucide-react';

export const AdminLayout: React.FC = () => {
  const { user } = useAuthStore();
  const orgId = user?.organizationId;
  const location = useLocation();
  const [isAppearanceOpen, setIsAppearanceOpen] = useState(false);

  // ─── Role Guard: Only org owners, org admins, and platform admins can access ───
  const isAdmin =
    user?.isPlatformAdmin ||
    user?.role === 'org_owner' ||
    user?.role === 'org_admin';

  if (!orgId) {
    return (
      <div className="flex h-screen items-center justify-center bg-background text-foreground">
        <div className="text-center p-8 rounded-xl border bg-card shadow-sm max-w-md">
          <ShieldAlert className="mx-auto h-12 w-12 text-destructive mb-4" />
          <h2 className="text-2xl font-bold tracking-tight">Access Denied</h2>
          <p className="text-muted-foreground mt-2">You must belong to an organization to access this page.</p>
          <Link to="/" className="mt-4 inline-block">
            <Button variant="outline" size="sm">Return to Dashboard</Button>
          </Link>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex h-screen items-center justify-center bg-background text-foreground">
        <div className="text-center p-10 rounded-2xl border bg-card shadow-lg max-w-lg">
          <div className="flex items-center justify-center w-16 h-16 rounded-full bg-destructive/10 mx-auto mb-4">
            <ShieldAlert className="h-8 w-8 text-destructive" />
          </div>
          <h2 className="text-2xl font-bold tracking-tight">Admin Access Required</h2>
          <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
            You don't have permission to access the Admin Panel.
            Only <span className="font-semibold text-foreground">Org Owners</span> and{' '}
            <span className="font-semibold text-foreground">Org Admins</span> can manage organization settings.
          </p>
          <p className="text-xs text-muted-foreground/70 mt-2">
            Your current role: <span className="font-mono font-semibold text-foreground/70">{user?.role ?? 'member'}</span>
          </p>
          <Link to="/" className="mt-6 inline-block">
            <Button size="sm" className="gap-2">
              <ArrowLeft className="h-4 w-4" />
              Back to Dashboard
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  const navItems = [
    { name: 'Users', path: `/admin/users`, icon: Users },
    { name: 'Roles & Permissions', path: `/admin/roles`, icon: Shield },
    { name: 'Single Sign-On (SSO)', path: `/admin/sso`, icon: KeyRound },
    { name: 'Developer API Keys', path: `/admin/developer`, icon: Code },
    { name: 'Audit Logs', path: `/admin/audit-logs`, icon: FileText },
    { name: 'Billing', path: `/admin/billing`, icon: CreditCard },
    { name: 'Branding', path: `/admin/branding`, icon: Palette },
    { name: 'Stage Templates', path: `/admin/stages`, icon: Workflow },
    { name: 'Labels & Tags', path: `/admin/labels`, icon: Tag },
    { name: 'Webhooks', path: `/admin/webhooks`, icon: Webhook },
    { name: 'Integrations', path: `/admin/integrations`, icon: Layers },
  ];

  return (
    <SidebarProvider className="flex h-screen w-full flex-col bg-background text-foreground transition-colors overflow-hidden">
      {/* Top Header */}
      <header className="shrink-0 z-30 flex h-14 items-center justify-between gap-3 border-b bg-background/85 backdrop-blur-md px-4 sm:px-6 shadow-2xs transition-colors">
        {/* Left: Trigger + Brand */}
        <div className="flex items-center gap-2.5 min-w-0">
          <SidebarTrigger className="h-8 w-8 shrink-0" />
          <div className="h-4 w-px bg-border/80 hidden sm:block shrink-0" />
          <Link to="/admin/users" className="flex items-center gap-2 font-semibold">
            <div className="p-1.5 rounded-lg bg-primary/10 text-primary border border-primary/20">
              <Trello className="h-4 w-4" />
            </div>
            <span className="text-sm font-bold tracking-tight text-foreground">Boardly Admin</span>
            <span className="text-[10px] uppercase font-semibold tracking-wider px-1.5 py-0.5 rounded-md bg-primary/10 text-primary border border-primary/20 hidden md:inline-block">
              Governance
            </span>
          </Link>
        </div>
        
        {/* Right: Back to App, Search, Notifications, Theme, User Profile */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/70 px-2.5 py-1.5 rounded-lg border border-border/70 shadow-2xs transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Back to App</span>
          </Link>

          <SearchPalette triggerContext="navbar" />

          <NotificationDropdown />

          <ThemeToggle />

          {/* Profile Avatar Quick Menu */}
          <div className="hidden sm:flex items-center border-l pl-3 ml-1">
            <UserProfileDropdown
              variant="navbar"
              onOpenAppearance={() => setIsAppearanceOpen(true)}
            />
          </div>
        </div>
      </header>

      {/* Main Workspace with Fixed Sidebar & Independent Content Scrolling */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        <Sidebar className="h-full border-r border-sidebar-border bg-sidebar select-none transition-all duration-200">
          <SidebarHeader className="border-b border-sidebar-border/60 p-3">
            <div className="px-1 py-0.5">
              <h2 className="text-xs font-bold tracking-tight text-sidebar-foreground uppercase">Admin Workspace</h2>
              <p className="text-[11px] text-muted-foreground mt-0.5">Manage organization governance</p>
            </div>
          </SidebarHeader>
          <SidebarContent className="p-2 space-y-4 overflow-y-auto">
            <SidebarGroup className="p-1">
              <SidebarGroupLabel className="text-[11px] font-semibold text-muted-foreground/80 px-2 mb-1">
                Governance &amp; Settings
              </SidebarGroupLabel>
              <SidebarGroupContent className="w-full">
                <SidebarMenu className="gap-1">
                  {navItems.map((item) => {
                    const isActive = location.pathname === item.path || location.pathname.startsWith(`${item.path}/`);
                    return (
                      <SidebarMenuItem key={item.name}>
                        <SidebarMenuButton asChild isActive={isActive} tooltip={item.name}>
                          <NavLink to={item.path}>
                            <item.icon className="h-4 w-4 shrink-0" />
                            <span className="truncate">{item.name}</span>
                          </NavLink>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>
          <SidebarFooter className="border-t border-sidebar-border/60 p-2 space-y-1">
            <div className="flex items-center justify-between px-1 text-xs text-muted-foreground">
              <Link
                to="/"
                className="flex items-center gap-1.5 px-2 py-1 rounded-md hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors cursor-pointer text-xs"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Main App</span>
              </Link>
              <button
                type="button"
                onClick={() => setIsAppearanceOpen(true)}
                className="flex items-center gap-1.5 px-2 py-1 rounded-md hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors cursor-pointer text-xs"
              >
                <Palette className="w-3.5 h-3.5" />
                <span>Theme</span>
              </button>
            </div>
            <UserProfileDropdown
              variant="sidebar"
              onOpenAppearance={() => setIsAppearanceOpen(true)}
            />
          </SidebarFooter>
          <SidebarRail />
        </Sidebar>

        {/* Independently scrollable main content */}
        <SidebarInset className="flex flex-1 flex-col overflow-y-auto bg-muted/20">
          <div className="w-full max-w-[1600px] mx-auto p-4 sm:p-6 lg:p-8">
            <Outlet />
          </div>
        </SidebarInset>
      </div>

      {/* Global Modals */}
      <AppearanceModal open={isAppearanceOpen} onOpenChange={setIsAppearanceOpen} />
    </SidebarProvider>
  );
};
