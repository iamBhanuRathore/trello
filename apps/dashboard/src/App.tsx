import { Suspense, lazy, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from './store/authStore';
import { Toaster } from 'sonner';
import { TooltipProvider } from '@boardly/ui';
import { GlobalTooltip } from './components/GlobalTooltip';
import { DashboardLayout } from './layouts/DashboardLayout';
import { AdminLayout } from './layouts/AdminLayout';
import { RouteFallback } from './components/common/RouteFallback';
import { RootErrorBoundary } from './components/common/RootErrorBoundary';

// ─── Code-split routes ─────────────────────────────────────────────
// Convention: EVERY page is React.lazy-loaded so each route ships as its
// own chunk. Layouts stay eager (they are the persistent shell).
// When adding a new page: lazy-import it here + wrap its route element in
// <Suspense fallback={<RouteFallback />}> (or rely on the <Routes>-level
// Suspense below). Never static-import a page into App.tsx.
const Login = lazy(() => import('./pages/Login').then((m) => ({ default: m.Login })));
const SignUp = lazy(() => import('./pages/SignUp').then((m) => ({ default: m.SignUp })));
const AcceptInvite = lazy(() =>
  import('./pages/AcceptInvite').then((m) => ({ default: m.AcceptInvite }))
);
const AuthCallback = lazy(() =>
  import('./pages/AuthCallback').then((m) => ({ default: m.AuthCallback }))
);
const Pricing = lazy(() => import('./pages/Pricing').then((m) => ({ default: m.Pricing })));
const PublicFormView = lazy(() =>
  import('./pages/PublicFormView').then((m) => ({ default: m.PublicFormView }))
);
const NotFound = lazy(() => import('./pages/NotFound').then((m) => ({ default: m.NotFound })));

// Main app routes
const Workspaces = lazy(() =>
  import('./pages/Workspaces').then((m) => ({ default: m.Workspaces }))
);
const BoardView = lazy(() => import('./pages/BoardView').then((m) => ({ default: m.BoardView })));
const TaskPage = lazy(() => import('./pages/TaskPage').then((m) => ({ default: m.TaskPage })));
const Marketplace = lazy(() =>
  import('./pages/Marketplace').then((m) => ({ default: m.Marketplace }))
);
const PortfolioDashboard = lazy(() =>
  import('./pages/PortfolioDashboard').then((m) => ({ default: m.PortfolioDashboard }))
);
const ProjectSprints = lazy(() =>
  import('./pages/ProjectSprints').then((m) => ({ default: m.ProjectSprints }))
);
const ProjectPhases = lazy(() =>
  import('./pages/ProjectPhases').then((m) => ({ default: m.ProjectPhases }))
);
const ProjectReports = lazy(() =>
  import('./pages/ProjectReports').then((m) => ({ default: m.ProjectReports }))
);
const ProjectDocs = lazy(() =>
  import('./pages/ProjectDocs').then((m) => ({ default: m.ProjectDocs }))
);
const ProjectAutomation = lazy(() =>
  import('./pages/ProjectAutomation').then((m) => ({ default: m.ProjectAutomation }))
);
const Timesheets = lazy(() =>
  import('./pages/Timesheets').then((m) => ({ default: m.Timesheets }))
);
const MyTasks = lazy(() => import('./pages/MyTasks').then((m) => ({ default: m.MyTasks })));
const ChatPage = lazy(() => import('./pages/ChatPage').then((m) => ({ default: m.ChatPage })));
const Calendar = lazy(() => import('./pages/Calendar').then((m) => ({ default: m.Calendar })));
const Integrations = lazy(() =>
  import('./pages/Integrations').then((m) => ({ default: m.Integrations }))
);
const ProfileSettings = lazy(() =>
  import('./pages/ProfileSettings').then((m) => ({ default: m.ProfileSettings }))
);
const NotificationSettings = lazy(() =>
  import('./pages/Settings/NotificationSettings').then((m) => ({
    default: m.NotificationSettings,
  }))
);
const Notifications = lazy(() =>
  import('./pages/Notifications').then((m) => ({ default: m.Notifications }))
);
const Inbox = lazy(() => import('./pages/Inbox').then((m) => ({ default: m.Inbox })));

// Admin routes
const Users = lazy(() => import('./pages/admin/Users').then((m) => ({ default: m.Users })));
const CustomRoles = lazy(() =>
  import('./pages/admin/CustomRoles').then((m) => ({ default: m.CustomRoles }))
);
const Priorities = lazy(() =>
  import('./pages/admin/Priorities').then((m) => ({ default: m.Priorities }))
);
const SSOSettings = lazy(() =>
  import('./pages/admin/SSOSettings').then((m) => ({ default: m.SSOSettings }))
);
const DeveloperSettings = lazy(() =>
  import('./pages/admin/DeveloperSettings').then((m) => ({ default: m.DeveloperSettings }))
);
const AuditLogs = lazy(() =>
  import('./pages/admin/AuditLogs').then((m) => ({ default: m.AuditLogs }))
);
const Billing = lazy(() => import('./pages/admin/Billing').then((m) => ({ default: m.Billing })));
const Branding = lazy(() =>
  import('./pages/admin/Branding').then((m) => ({ default: m.Branding }))
);
const StageTemplates = lazy(() =>
  import('./pages/admin/StageTemplates').then((m) => ({ default: m.StageTemplates }))
);
const LabelsAdmin = lazy(() =>
  import('./pages/admin/LabelsAdmin').then((m) => ({ default: m.LabelsAdmin }))
);
const WebhookSettings = lazy(() =>
  import('./pages/Settings/WebhookSettings').then((m) => ({ default: m.WebhookSettings }))
);
const SettingsLayout = lazy(() =>
  import('./components/settings/SettingsShell').then((m) => ({ default: m.SettingsLayout }))
);

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const isLoading = useAuthStore((state) => state.isLoading);

  if (isLoading)
    return <div className="flex h-screen w-screen items-center justify-center">Loading...</div>;
  if (!isAuthenticated) return <Navigate to="/login" replace />;

  return <>{children}</>;
}

/**
 * Crash containment for the route tree, keyed by pathname so a tripped
 * fallback clears itself on navigation instead of sticking until reload.
 */
function BoundaryWithRouteReset({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  return <RootErrorBoundary resetKey={location.pathname}>{children}</RootErrorBoundary>;
}

export function App() {
  const checkAuth = useAuthStore((state) => state.checkAuth);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  // Staleness safety net: a role change can leave permissions stale until the
  // 60s server TTL lapses. Revalidate /me on window focus (throttled — /me is
  // server-cached, but focus can fire in bursts across iframe/dialog moves).
  useEffect(() => {
    let last = 0;
    const onFocus = () => {
      const now = Date.now();
      if (now - last < 60_000) return;
      last = now;
      if (useAuthStore.getState().isAuthenticated) void checkAuth();
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [checkAuth]);

  return (
    <TooltipProvider delay={500} closeDelay={300}>
      <BrowserRouter>
        <BoundaryWithRouteReset>
          <Suspense fallback={<RouteFallback label="Loading page…" />}>
            <Routes>
              <Route path="/pricing" element={<Pricing />} />
              <Route path="/login" element={<Login />} />
              <Route path="/signup" element={<SignUp />} />
              <Route path="/invite" element={<AcceptInvite />} />
              <Route path="/auth/callback" element={<AuthCallback />} />
              <Route path="/forms/:slug" element={<PublicFormView />} />

              <Route
                path="/"
                element={
                  <ProtectedRoute>
                    <DashboardLayout />
                  </ProtectedRoute>
                }
              >
                <Route index element={<Workspaces />} />
                <Route path="b/:boardId" element={<BoardView />} />
                <Route path="b/:boardId/c/:cardId" element={<TaskPage />} />
                <Route path="cards/:cardId" element={<TaskPage />} />
                <Route path="marketplace" element={<Marketplace />} />
                <Route path="workspaces/:workspaceId/portfolio" element={<PortfolioDashboard />} />
                <Route path="projects/:projectId/sprints" element={<ProjectSprints />} />
                <Route path="projects/:projectId/phases" element={<ProjectPhases />} />
                <Route path="projects/:projectId/reports" element={<ProjectReports />} />
                <Route path="projects/:projectId/docs" element={<ProjectDocs />} />
                <Route path="projects/:projectId/automation" element={<ProjectAutomation />} />
                <Route path="timesheets" element={<Timesheets />} />
                <Route path="my-tasks" element={<MyTasks />} />
                <Route path="tasks" element={<MyTasks />} />
                <Route path="notifications" element={<Notifications />} />
                <Route path="inbox" element={<Inbox />} />
                <Route path="chat" element={<ChatPage />} />
                <Route path="chat/:channelId" element={<ChatPage />} />
                <Route path="calendar" element={<Calendar />} />
                <Route element={<SettingsLayout />}>
                  <Route path="profile" element={<ProfileSettings />} />
                  <Route path="settings/profile" element={<ProfileSettings />} />
                  <Route path="settings/notifications" element={<NotificationSettings />} />
                </Route>
              </Route>

              <Route
                path="/admin"
                element={
                  <ProtectedRoute>
                    <AdminLayout />
                  </ProtectedRoute>
                }
              >
                <Route index element={<Navigate to="users" replace />} />
                <Route path="users" element={<Users />} />
                <Route path="roles" element={<CustomRoles />} />
                <Route path="priorities" element={<Priorities />} />
                <Route path="sso" element={<SSOSettings />} />
                <Route path="developer" element={<DeveloperSettings />} />
                <Route path="audit-logs" element={<AuditLogs />} />
                <Route path="billing" element={<Billing />} />
                <Route path="branding" element={<Branding />} />
                <Route path="stages" element={<StageTemplates />} />
                <Route path="labels" element={<LabelsAdmin />} />
                <Route path="webhooks" element={<WebhookSettings />} />
                <Route path="integrations" element={<Integrations />} />
              </Route>

              {/* 404 Catch-All Route */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </BoundaryWithRouteReset>
        <GlobalTooltip />
        <Toaster richColors position="top-right" closeButton />
      </BrowserRouter>
    </TooltipProvider>
  );
}
