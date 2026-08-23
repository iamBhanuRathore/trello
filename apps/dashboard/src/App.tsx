import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/authStore';
import { Login } from './pages/Login';
import { SignUp } from './pages/SignUp';
import { DashboardLayout } from './layouts/DashboardLayout';
import { AdminLayout } from './layouts/AdminLayout';
import { SuperAdminLayout } from './layouts/SuperAdminLayout';
import { BoardView } from './pages/BoardView';
import { Workspaces } from './pages/Workspaces';
import { Users } from './pages/admin/Users';
import { Billing } from './pages/admin/Billing';
import { Branding } from './pages/admin/Branding';
import { StageTemplates } from './pages/admin/StageTemplates';
import { Tenants } from './pages/super-admin/Tenants';
import { Plans } from './pages/super-admin/Plans';
import { ProjectSprints } from './pages/ProjectSprints';
import { ProjectPhases } from './pages/ProjectPhases';
import { ProjectReports } from './pages/ProjectReports';
import { ProjectDocs } from './pages/ProjectDocs';
import { Timesheets } from './pages/Timesheets';
import { MyTasks } from './pages/MyTasks';
import { CustomRoles } from './pages/admin/CustomRoles';
import { AuditLogs } from './pages/admin/AuditLogs';
import { SSOSettings } from './pages/admin/SSOSettings';
import { DeveloperSettings } from './pages/admin/DeveloperSettings';
import { Marketplace } from './pages/Marketplace';
import { PublicFormView } from './pages/PublicFormView';
import { PortfolioDashboard } from './pages/PortfolioDashboard';
import { NotificationSettings } from './pages/Settings/NotificationSettings';
import { WebhookSettings } from './pages/Settings/WebhookSettings';
import { Integrations } from './pages/Integrations';
import { TaskPage } from './pages/TaskPage';
import { ProfileSettings } from './pages/ProfileSettings';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuthStore();
  
  if (isLoading) return <div className="flex h-screen w-screen items-center justify-center">Loading...</div>;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  
  return <>{children}</>;
}

export function App() {
  const checkAuth = useAuthStore((state) => state.checkAuth);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<SignUp />} />
        <Route path="/forms/:slug" element={<PublicFormView />} />
        
        <Route path="/" element={<ProtectedRoute><DashboardLayout /></ProtectedRoute>}>
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
          <Route path="timesheets" element={<Timesheets />} />
          <Route path="my-tasks" element={<MyTasks />} />
          <Route path="tasks" element={<MyTasks />} />
          <Route path="profile" element={<ProfileSettings />} />
          <Route path="settings/profile" element={<ProfileSettings />} />
          <Route path="settings/notifications" element={<NotificationSettings />} />
        </Route>

        <Route path="/admin" element={<ProtectedRoute><AdminLayout /></ProtectedRoute>}>
          <Route index element={<Navigate to="users" replace />} />
          <Route path="users" element={<Users />} />
          <Route path="roles" element={<CustomRoles />} />
          <Route path="sso" element={<SSOSettings />} />
          <Route path="developer" element={<DeveloperSettings />} />
          <Route path="audit-logs" element={<AuditLogs />} />
          <Route path="billing" element={<Billing />} />
          <Route path="branding" element={<Branding />} />
          <Route path="stages" element={<StageTemplates />} />
          <Route path="webhooks" element={<WebhookSettings />} />
          <Route path="integrations" element={<Integrations />} />
        </Route>

        <Route path="/super-admin" element={<ProtectedRoute><SuperAdminLayout /></ProtectedRoute>}>
          <Route index element={<Navigate to="tenants" replace />} />
          <Route path="tenants" element={<Tenants />} />
          <Route path="plans" element={<Plans />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
