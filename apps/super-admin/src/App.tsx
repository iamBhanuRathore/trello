import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/authStore';
import { Login } from './pages/Login';
import { SuperAdminLayout } from './layouts/SuperAdminLayout';
import { Overview } from './pages/Overview';
import { Tenants } from './pages/Tenants';
import { PlatformUsers } from './pages/PlatformUsers';
import { Plans } from './pages/Plans';
import { NotFound } from './pages/NotFound';
import { Toaster } from 'sonner';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, user } = useAuthStore();

  if (isLoading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-[#09090b] text-foreground">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-purple-500 border-t-transparent animate-spin" />
          <span className="text-xs text-muted-foreground font-mono">Authenticating Super Admin...</span>
        </div>
      </div>
    );
  }

  if (!isAuthenticated || !user?.isPlatformAdmin) {
    return <Navigate to="/login" replace />;
  }

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

        <Route
          path="/"
          element={
            <ProtectedRoute>
              <SuperAdminLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Overview />} />
          <Route path="tenants" element={<Tenants />} />
          <Route path="users" element={<PlatformUsers />} />
          <Route path="plans" element={<Plans />} />
        </Route>

        <Route path="*" element={<NotFound />} />
      </Routes>
      <Toaster richColors position="bottom-right" closeButton theme="dark" />
    </BrowserRouter>
  );
}
