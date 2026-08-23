import React from 'react';
import { Outlet, NavLink, Link, useLocation } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { Button } from '@boardly/ui/button';
import {
  SidebarProvider,
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarRail,
  SidebarInset,
  SidebarTrigger,
} from '@boardly/ui/sidebar';
import { NotificationDropdown } from '../components/NotificationDropdown';
import { ThemeToggle } from '../components/ThemeToggle';
import {
  Building2,
  Package,
  ShieldAlert,
  KanbanSquare,
  LogOut,
  ArrowLeft,
} from 'lucide-react';

export const SuperAdminLayout: React.FC = () => {
  const { user, logout } = useAuthStore();
  const location = useLocation();

  if (!user?.isPlatformAdmin) {
    return (
      <div className="flex h-screen items-center justify-center bg-background text-foreground">
        <div className="text-center p-8 rounded-xl border bg-card shadow-sm max-w-md">
          <ShieldAlert className="mx-auto h-12 w-12 text-destructive mb-4" />
          <h2 className="text-2xl font-bold tracking-tight">Access Denied</h2>
          <p className="text-muted-foreground mt-2">You must be a platform administrator to access this area.</p>
          <Link to="/" className="mt-4 inline-block">
            <Button size="sm">Return to App</Button>
          </Link>
        </div>
      </div>
    );
  }

  const navItems = [
    { name: 'Tenants', path: `/super-admin/tenants`, icon: Building2 },
    { name: 'Plans & Features', path: `/super-admin/plans`, icon: Package },
  ];

  return (
    <SidebarProvider className="flex h-screen w-full flex-col bg-background text-foreground transition-colors overflow-hidden">
      {/* Header */}
      <header className="shrink-0 z-30 flex h-14 items-center gap-3 border-b bg-background/80 backdrop-blur-md px-4 sm:px-6 py-3 shadow-xs transition-colors">
        <div className="flex items-center gap-2">
          <SidebarTrigger className="md:hidden" />
          <Link to="/" className="flex items-center gap-2 font-semibold">
            <div className="p-1 rounded-md bg-purple-500/10 text-purple-600 dark:text-purple-400">
              <KanbanSquare className="h-5 w-5" />
            </div>
            <span className="text-lg font-bold tracking-tight">Boardly Super Admin</span>
          </Link>
        </div>
        
        <div className="ml-auto flex items-center gap-3">
          <Link to="/" className="text-sm font-medium text-muted-foreground hover:text-foreground flex items-center gap-1.5 transition-colors">
            <ArrowLeft className="h-4 w-4" /> Back to App
          </Link>
          <NotificationDropdown />
          <ThemeToggle />
          <div className="text-sm font-medium text-muted-foreground hidden sm:inline-block border-l pl-3">
            {user?.name}
          </div>
          <Button variant="ghost" size="icon" onClick={() => logout()} className="hover:bg-destructive/10 hover:text-destructive">
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </header>

      {/* Main Layout with Sidebar */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        <Sidebar className="h-full">
          <SidebarHeader>
            <div className="px-1 py-1">
              <h2 className="text-sm font-semibold tracking-tight text-sidebar-foreground">Super Admin</h2>
              <p className="text-xs text-muted-foreground mt-0.5">Platform management</p>
            </div>
          </SidebarHeader>
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel>Platform Governance</SidebarGroupLabel>
              <SidebarMenu>
                {navItems.map((item) => {
                  const isActive = location.pathname === item.path || location.pathname.startsWith(`${item.path}/`);
                  return (
                    <SidebarMenuItem key={item.name}>
                      <SidebarMenuButton asChild isActive={isActive}>
                        <NavLink to={item.path}>
                          <item.icon className="h-4 w-4 shrink-0 text-purple-500" />
                          <span className="truncate">{item.name}</span>
                        </NavLink>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroup>
          </SidebarContent>
          <SidebarRail />
        </Sidebar>

        {/* Independently scrollable main content */}
        <SidebarInset className="flex flex-1 flex-col overflow-y-auto bg-muted/20">
          <div className="max-w-5xl mx-auto p-6 md:p-8 w-full">
            <Outlet />
          </div>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
};
