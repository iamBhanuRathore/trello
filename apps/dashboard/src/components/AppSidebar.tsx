import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAuthStore } from '../store/authStore';
import {
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
  SidebarSeparator,
  SidebarRail,
  useSidebar,
} from '@boardly/ui/sidebar';
import { Kbd } from './ui/Kbd';
import { formatShortcut } from '../lib/platform';
import {
  LayoutDashboard,
  CheckSquare,
  Clock,
  Sparkles,
  Briefcase,
  ChevronRight,
  ChevronDown,
  BookOpen,
  Columns,
  Flame,
  Workflow,
  BarChart3,
  Shield,
  Crown,
  Trash2,
  Palette,
  Search,
  Plus,
  Folder,
  FolderOpen,
} from 'lucide-react';
import { UserProfileDropdown } from './UserProfileDropdown';

interface AppSidebarProps {
  onOpenTrash?: () => void;
  onOpenAppearance?: () => void;
}

export const AppSidebar: React.FC<AppSidebarProps> = ({ onOpenTrash, onOpenAppearance }) => {
  const location = useLocation();
  const { user } = useAuthStore();
  const { isMobile, setOpenMobile, state } = useSidebar();
  const isCollapsed = state === 'collapsed';

  const isAdmin = user?.isPlatformAdmin || user?.role === 'org_owner' || user?.role === 'org_admin';

  // Fetch workspaces & projects tree (single aggregate request — was N+1).
  const {
    data: workspaces = [],
    isLoading: isWsLoading,
    isError: isWsError,
    refetch: refetchWorkspaces,
  } = useQuery({
    queryKey: ['workspaces', 'tree'],
    queryFn: async () => {
      const res = await api.get('/workspaces/tree');
      return res.data;
    },
    staleTime: 30_000,
    gcTime: 5 * 60_000,
  });

  // Track expanded state for workspaces and projects
  const [expandedWorkspaces, setExpandedWorkspaces] = useState<Record<string, boolean>>({});
  const [expandedProjects, setExpandedProjects] = useState<Record<string, boolean>>({});

  // Auto-expand all workspaces on initial load
  useEffect(() => {
    if (workspaces.length > 0) {
      const initialWs: Record<string, boolean> = {};
      const initialProj: Record<string, boolean> = {};

      workspaces.forEach((ws: any) => {
        initialWs[ws.id] = true;
        ws.projects?.forEach((p: any) => {
          initialProj[p.id] = true;
        });
      });

      setExpandedWorkspaces((prev) => ({ ...initialWs, ...prev }));
      setExpandedProjects((prev) => ({ ...initialProj, ...prev }));
    }
  }, [workspaces]);

  const toggleWorkspace = (wsId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setExpandedWorkspaces((prev) => ({ ...prev, [wsId]: !prev[wsId] }));
  };

  const toggleProject = (projId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setExpandedProjects((prev) => ({ ...prev, [projId]: !prev[projId] }));
  };

  const handleNavClick = () => {
    if (isMobile) {
      setOpenMobile(false);
    }
  };

  const triggerSearchPalette = () => {
    window.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'k',
        metaKey: true,
        bubbles: true,
      })
    );
  };

  return (
    <Sidebar
      collapsible="icon"
      className="border-r border-sidebar-border bg-sidebar select-none transition-all duration-200"
    >
      {/* ─── Header: Brand & Search Action ─── */}
      <SidebarHeader
        className={`sticky top-0 z-10 bg-sidebar/98 backdrop-blur-md border-b border-sidebar-border/60 shrink-0 ${isCollapsed ? 'p-2' : 'p-3'}`}
      >
        {isCollapsed ? (
          <div className="flex flex-col items-center gap-2">
            <Link
              to="/"
              onClick={handleNavClick}
              title="Boardly — All Workspaces"
              className="w-8 h-8 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shadow-xs hover:scale-105 transition-transform"
            >
              <LayoutDashboard className="w-4 h-4" />
            </Link>
            <button
              type="button"
              onClick={triggerSearchPalette}
              title={`Search or jump to... (${formatShortcut('mod+k')})`}
              className="w-8 h-8 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-sidebar-accent border border-sidebar-border/80 rounded-lg transition-colors cursor-pointer"
            >
              <Search className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2 px-1">
              <Link to="/" onClick={handleNavClick} className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shadow-xs shrink-0 group-hover:scale-105 transition-transform">
                  <LayoutDashboard className="w-4 h-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-sm tracking-tight text-sidebar-foreground truncate">
                      Boardly
                    </span>
                    <span className="text-[10px] uppercase font-semibold tracking-wider px-1.5 py-0.2 rounded-md bg-primary/10 text-primary border border-primary/20">
                      Pro
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground truncate leading-tight mt-0.5">
                    {user?.organizationId ? 'Active Workspace' : 'Personal Hub'}
                  </p>
                </div>
              </Link>
            </div>

            {/* Expanded Search Bar */}
            <button
              type="button"
              onClick={triggerSearchPalette}
              className="w-full flex items-center justify-between px-2.5 py-1.5 text-xs text-muted-foreground bg-sidebar-accent/50 hover:bg-sidebar-accent hover:text-sidebar-foreground border border-sidebar-border/80 rounded-lg transition-colors cursor-pointer shadow-2xs"
            >
              <div className="flex items-center gap-2">
                <Search className="w-3.5 h-3.5 text-muted-foreground/70" />
                <span>Search or jump to...</span>
              </div>
              <Kbd shortcut="mod+k" className="bg-background/80" />
            </button>
          </div>
        )}
      </SidebarHeader>

      {/* ─── Main Content Nav Groups ─── */}
      <SidebarContent
        className={`sidebar-scroll overscroll-contain overflow-y-auto overflow-x-hidden ${isCollapsed ? 'p-1.5 space-y-2' : 'p-2 space-y-4'}`}
      >
        {/* 1. Core Primary Views */}
        <SidebarGroup className={isCollapsed ? 'p-0 items-center' : 'p-1'}>
          {!isCollapsed && (
            <SidebarGroupLabel className="text-[11px] font-semibold text-muted-foreground/80 px-2 mb-1">
              Overview
            </SidebarGroupLabel>
          )}
          <SidebarGroupContent className={isCollapsed ? 'w-auto' : 'w-full'}>
            <SidebarMenu className={isCollapsed ? 'items-center gap-1.5' : 'gap-1'}>
              {/* Workspaces */}
              <SidebarMenuItem className={isCollapsed ? 'flex justify-center' : ''}>
                <SidebarMenuButton
                  asChild
                  isActive={location.pathname === '/'}
                  tooltip="Workspaces"
                  className={
                    isCollapsed ? 'w-8 h-8 p-0 flex items-center justify-center rounded-lg' : ''
                  }
                >
                  <Link
                    to="/"
                    onClick={handleNavClick}
                    title={isCollapsed ? 'Workspaces' : undefined}
                  >
                    <LayoutDashboard className="w-4 h-4 text-sky-500 shrink-0" />
                    {!isCollapsed && <span>Workspaces</span>}
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>

              {/* My Tasks */}
              <SidebarMenuItem className={isCollapsed ? 'flex justify-center' : ''}>
                <SidebarMenuButton
                  asChild
                  isActive={location.pathname === '/my-tasks' || location.pathname === '/tasks'}
                  tooltip="My Tasks"
                  className={
                    isCollapsed ? 'w-8 h-8 p-0 flex items-center justify-center rounded-lg' : ''
                  }
                >
                  <Link
                    to="/my-tasks"
                    onClick={handleNavClick}
                    title={isCollapsed ? 'My Tasks' : undefined}
                  >
                    <CheckSquare className="w-4 h-4 text-emerald-500 shrink-0" />
                    {!isCollapsed && <span>My Tasks</span>}
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>

              {/* Timesheets */}
              <SidebarMenuItem className={isCollapsed ? 'flex justify-center' : ''}>
                <SidebarMenuButton
                  asChild
                  isActive={location.pathname === '/timesheets'}
                  tooltip="Timesheets"
                  className={
                    isCollapsed ? 'w-8 h-8 p-0 flex items-center justify-center rounded-lg' : ''
                  }
                >
                  <Link
                    to="/timesheets"
                    onClick={handleNavClick}
                    title={isCollapsed ? 'Timesheets' : undefined}
                  >
                    <Clock className="w-4 h-4 text-amber-500 shrink-0" />
                    {!isCollapsed && <span>Timesheets</span>}
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>

              {/* Marketplace */}
              <SidebarMenuItem className={isCollapsed ? 'flex justify-center' : ''}>
                <SidebarMenuButton
                  asChild
                  isActive={location.pathname === '/marketplace'}
                  tooltip="Power-Ups & Apps"
                  className={
                    isCollapsed ? 'w-8 h-8 p-0 flex items-center justify-center rounded-lg' : ''
                  }
                >
                  <Link
                    to="/marketplace"
                    onClick={handleNavClick}
                    title={isCollapsed ? 'Power-Ups & Apps' : undefined}
                  >
                    <Sparkles className="w-4 h-4 text-purple-500 shrink-0" />
                    {!isCollapsed && <span>Power-Ups &amp; Apps</span>}
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarSeparator className="my-1" />

        {/* 2. Workspaces & Projects Tree Navigation */}
        <SidebarGroup className={isCollapsed ? 'p-0 items-center' : 'p-1'}>
          {!isCollapsed && (
            <div className="flex items-center justify-between px-2 mb-1">
              <SidebarGroupLabel className="text-[11px] font-semibold text-muted-foreground/80 p-0">
                Workspaces &amp; Teams
              </SidebarGroupLabel>
              <Link
                to="/"
                onClick={handleNavClick}
                title="Add / View Workspaces"
                className="text-muted-foreground hover:text-foreground p-0.5 rounded-md hover:bg-sidebar-accent transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
              </Link>
            </div>
          )}

          <SidebarGroupContent className={isCollapsed ? 'w-auto' : 'w-full'}>
            {isWsLoading ? (
              !isCollapsed && (
                <div className="px-2 py-1 space-y-2" aria-label="Loading workspaces">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="space-y-1.5">
                      <div className="h-7 rounded-md bg-muted/60 animate-pulse" />
                      <div className="ml-4 h-5 w-3/4 rounded-md bg-muted/40 animate-pulse" />
                      <div className="ml-4 h-5 w-2/3 rounded-md bg-muted/40 animate-pulse" />
                    </div>
                  ))}
                </div>
              )
            ) : isWsError && workspaces.length === 0 ? (
              !isCollapsed && (
                <div className="px-3 py-2 text-xs text-muted-foreground">
                  <p>Couldn&apos;t load teams.</p>
                  <button
                    type="button"
                    onClick={() => refetchWorkspaces()}
                    className="text-primary hover:underline text-[11px] mt-1 cursor-pointer"
                  >
                    Retry
                  </button>
                </div>
              )
            ) : workspaces.length === 0 ? (
              !isCollapsed && (
                <div className="px-3 py-2 text-xs text-muted-foreground">
                  <p>No workspaces yet.</p>
                  <Link to="/" className="text-primary hover:underline text-[11px] mt-1 block">
                    + Create Workspace
                  </Link>
                </div>
              )
            ) : (
              <div className={`space-y-1 ${isCollapsed ? 'flex flex-col items-center gap-1' : ''}`}>
                {workspaces.map((ws: any) => {
                  const isWsExpanded = !!expandedWorkspaces[ws.id];
                  const isPortfolioActive = location.pathname === `/workspaces/${ws.id}/portfolio`;

                  if (isCollapsed) {
                    return (
                      <Link
                        key={ws.id}
                        to="/"
                        onClick={handleNavClick}
                        title={`Workspace: ${ws.name}`}
                        className="w-8 h-8 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary flex items-center justify-center text-xs font-bold transition-colors cursor-pointer border border-primary/20 shadow-2xs"
                      >
                        {ws.name.charAt(0).toUpperCase()}
                      </Link>
                    );
                  }

                  return (
                    <div key={ws.id} className="space-y-0.5">
                      {/* Workspace Parent Row */}
                      <div className="flex items-center group/ws rounded-lg hover:bg-sidebar-accent transition-colors">
                        <button
                          type="button"
                          onClick={(e) => toggleWorkspace(ws.id, e)}
                          className="p-1 text-muted-foreground hover:text-foreground shrink-0 cursor-pointer"
                        >
                          {isWsExpanded ? (
                            <ChevronDown className="w-3.5 h-3.5" />
                          ) : (
                            <ChevronRight className="w-3.5 h-3.5" />
                          )}
                        </button>
                        <Link
                          to="/"
                          onClick={handleNavClick}
                          className="flex items-center gap-2 flex-1 min-w-0 py-1.5 pr-2 text-xs font-semibold text-sidebar-foreground truncate"
                        >
                          <div className="w-4 h-4 rounded-md bg-primary/10 text-primary flex items-center justify-center text-[10px] font-bold shrink-0">
                            {ws.name.charAt(0).toUpperCase()}
                          </div>
                          <span className="truncate">{ws.name}</span>
                        </Link>
                      </div>

                      {/* Workspace Sub-tree */}
                      {isWsExpanded && (
                        <div className="pl-4 ml-1.5 border-l border-sidebar-border/70 space-y-1 pt-0.5">
                          {/* Portfolio link */}
                          <Link
                            to={`/workspaces/${ws.id}/portfolio`}
                            onClick={handleNavClick}
                            className={`flex items-center gap-2 px-2 py-1 rounded-md text-xs transition-colors ${
                              isPortfolioActive
                                ? 'bg-primary/10 text-primary font-medium'
                                : 'text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent'
                            }`}
                          >
                            <Briefcase className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                            <span className="truncate">Portfolio Health</span>
                          </Link>

                          {/* Projects in workspace */}
                          {ws.projects && ws.projects.length > 0 ? (
                            ws.projects.map((proj: any) => {
                              const isProjExpanded = !!expandedProjects[proj.id];
                              const isDocsActive =
                                location.pathname === `/projects/${proj.id}/docs`;
                              const isSprintsActive =
                                location.pathname === `/projects/${proj.id}/sprints`;
                              const isPhasesActive =
                                location.pathname === `/projects/${proj.id}/phases`;
                              const isReportsActive =
                                location.pathname === `/projects/${proj.id}/reports`;

                              return (
                                <div key={proj.id} className="space-y-0.5">
                                  {/* Project Header */}
                                  <div className="flex items-center group/proj rounded-md hover:bg-sidebar-accent/80 transition-colors">
                                    <button
                                      type="button"
                                      onClick={(e) => toggleProject(proj.id, e)}
                                      className="p-1 text-muted-foreground hover:text-foreground shrink-0 cursor-pointer"
                                    >
                                      {isProjExpanded ? (
                                        <ChevronDown className="w-3 h-3" />
                                      ) : (
                                        <ChevronRight className="w-3 h-3" />
                                      )}
                                    </button>
                                    <span className="text-xs font-medium text-sidebar-foreground truncate py-1 pr-2 flex items-center gap-1.5">
                                      {isProjExpanded ? (
                                        <FolderOpen className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                                      ) : (
                                        <Folder className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                                      )}
                                      <span className="truncate">{proj.name}</span>
                                    </span>
                                  </div>

                                  {/* Project Sub-items */}
                                  {isProjExpanded && (
                                    <div className="pl-4 ml-1.5 border-l border-sidebar-border/50 space-y-0.5 pt-0.5">
                                      {/* Boards list */}
                                      {proj.boards && proj.boards.length > 0 ? (
                                        proj.boards.map((b: any) => {
                                          const isBoardActive =
                                            location.pathname === `/b/${b.id}` ||
                                            location.pathname.startsWith(`/b/${b.id}/`);
                                          return (
                                            <Link
                                              key={b.id}
                                              to={`/b/${b.id}`}
                                              onClick={handleNavClick}
                                              className={`flex items-center gap-2 px-2 py-1 rounded-md text-[11px] transition-colors ${
                                                isBoardActive
                                                  ? 'bg-teal-500/10 text-teal-600 dark:text-teal-400 font-medium'
                                                  : 'text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent'
                                              }`}
                                            >
                                              <Columns className="w-3 h-3 text-teal-500 shrink-0" />
                                              <span className="truncate">{b.name || b.title}</span>
                                            </Link>
                                          );
                                        })
                                      ) : (
                                        <span className="text-[10px] text-muted-foreground/70 italic px-2 py-0.5 block">
                                          No boards yet
                                        </span>
                                      )}

                                      {/* Docs */}
                                      <Link
                                        to={`/projects/${proj.id}/docs`}
                                        onClick={handleNavClick}
                                        className={`flex items-center gap-2 px-2 py-1 rounded-md text-[11px] transition-colors ${
                                          isDocsActive
                                            ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 font-medium'
                                            : 'text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent'
                                        }`}
                                      >
                                        <BookOpen className="w-3 h-3 text-amber-500 shrink-0" />
                                        <span>Docs &amp; Wiki</span>
                                      </Link>

                                      {/* Sprints */}
                                      <Link
                                        to={`/projects/${proj.id}/sprints`}
                                        onClick={handleNavClick}
                                        className={`flex items-center gap-2 px-2 py-1 rounded-md text-[11px] transition-colors ${
                                          isSprintsActive
                                            ? 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 font-medium'
                                            : 'text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent'
                                        }`}
                                      >
                                        <Flame className="w-3 h-3 text-indigo-500 shrink-0" />
                                        <span>Sprints</span>
                                      </Link>

                                      {/* Phases */}
                                      <Link
                                        to={`/projects/${proj.id}/phases`}
                                        onClick={handleNavClick}
                                        className={`flex items-center gap-2 px-2 py-1 rounded-md text-[11px] transition-colors ${
                                          isPhasesActive
                                            ? 'bg-sky-500/10 text-sky-600 dark:text-sky-400 font-medium'
                                            : 'text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent'
                                        }`}
                                      >
                                        <Workflow className="w-3 h-3 text-sky-500 shrink-0" />
                                        <span>Phases</span>
                                      </Link>

                                      {/* Reports */}
                                      <Link
                                        to={`/projects/${proj.id}/reports`}
                                        onClick={handleNavClick}
                                        className={`flex items-center gap-2 px-2 py-1 rounded-md text-[11px] transition-colors ${
                                          isReportsActive
                                            ? 'bg-purple-500/10 text-purple-600 dark:text-purple-400 font-medium'
                                            : 'text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent'
                                        }`}
                                      >
                                        <BarChart3 className="w-3 h-3 text-purple-500 shrink-0" />
                                        <span>Reports</span>
                                      </Link>
                                    </div>
                                  )}
                                </div>
                              );
                            })
                          ) : (
                            <span className="text-[10px] text-muted-foreground/70 italic px-2 py-0.5 block">
                              No projects yet
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </SidebarGroupContent>
        </SidebarGroup>

        {/* 3. Admin & Configuration */}
        {(isAdmin || user?.isPlatformAdmin) && (
          <>
            <SidebarSeparator className="my-1" />
            <SidebarGroup className={isCollapsed ? 'p-0 items-center' : 'p-1'}>
              {!isCollapsed && (
                <SidebarGroupLabel className="text-[11px] font-semibold text-muted-foreground/80 px-2 mb-1">
                  Management
                </SidebarGroupLabel>
              )}
              <SidebarGroupContent className={isCollapsed ? 'w-auto' : 'w-full'}>
                <SidebarMenu className={isCollapsed ? 'items-center gap-1.5' : 'gap-1'}>
                  {isAdmin && (
                    <SidebarMenuItem className={isCollapsed ? 'flex justify-center' : ''}>
                      <SidebarMenuButton
                        asChild
                        isActive={location.pathname.startsWith('/admin')}
                        tooltip="Admin Panel"
                        className={
                          isCollapsed
                            ? 'w-8 h-8 p-0 flex items-center justify-center rounded-lg'
                            : ''
                        }
                      >
                        <Link
                          to="/admin/users"
                          onClick={handleNavClick}
                          title={isCollapsed ? 'Admin Panel' : undefined}
                        >
                          <Shield className="w-4 h-4 text-sky-500 shrink-0" />
                          {!isCollapsed && <span>Admin Panel</span>}
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  )}

                  {user?.isPlatformAdmin && (
                    <SidebarMenuItem className={isCollapsed ? 'flex justify-center' : ''}>
                      <SidebarMenuButton
                        asChild
                        tooltip="Super Admin Portal"
                        className={
                          isCollapsed
                            ? 'w-8 h-8 p-0 flex items-center justify-center rounded-lg'
                            : ''
                        }
                      >
                        <a
                          href="http://localhost:5174"
                          target="_blank"
                          rel="noopener noreferrer"
                          title={isCollapsed ? 'Super Admin Portal' : undefined}
                        >
                          <Crown className="w-4 h-4 text-purple-500 shrink-0" />
                          {!isCollapsed && <span>Super Admin Portal</span>}
                        </a>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  )}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </>
        )}
      </SidebarContent>

      {/* ─── Footer: Utilities & User Profile Popover ─── */}
      <SidebarFooter
        className={`sticky bottom-0 z-10 bg-sidebar/98 backdrop-blur-md border-t border-sidebar-border/60 shrink-0 ${isCollapsed ? 'p-1.5 flex flex-col items-center gap-1.5' : 'p-2 space-y-1'}`}
      >
        {/* Quick Utilities: Trash & Appearance */}
        {isCollapsed ? (
          <div className="flex flex-col items-center gap-1.5">
            <button
              type="button"
              onClick={onOpenTrash}
              title="Recycle Bin & Trash"
              className="w-8 h-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-sidebar-accent transition-colors cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={onOpenAppearance}
              title="Theme & Appearance"
              className="w-8 h-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-sidebar-accent transition-colors cursor-pointer"
            >
              <Palette className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-between px-1 text-xs text-muted-foreground">
            <button
              type="button"
              onClick={onOpenTrash}
              title="Recycle Bin &amp; Trash"
              className="flex items-center gap-1.5 px-2 py-1 rounded-md hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors cursor-pointer text-xs"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Trash Bin</span>
            </button>

            <button
              type="button"
              onClick={onOpenAppearance}
              title="Theme &amp; Appearance"
              className="flex items-center gap-1.5 px-2 py-1 rounded-md hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors cursor-pointer text-xs"
            >
              <Palette className="w-3.5 h-3.5" />
              <span>Theme</span>
            </button>
          </div>
        )}

        {/* User Profile Card Dropdown */}
        <UserProfileDropdown
          variant="sidebar"
          isCollapsed={isCollapsed}
          onOpenAppearance={onOpenAppearance}
          onItemClick={handleNavClick}
        />
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
};
