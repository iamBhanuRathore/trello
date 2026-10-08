import React, { useEffect, Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/authStore';
import { Login } from './pages/Login';
import { SuperAdminLayout } from './layouts/SuperAdminLayout';
import { RootErrorBoundary } from './components/RootErrorBoundary';
import { Toaster } from 'sonner';

// Convention: every OPS section is React.lazy-loaded so each route ships as
// its own chunk (the portal was a single 615 kB bundle). Login stays eager —
// it is the entry point and must paint instantly.
const Overview = lazy(() => import('./pages/Overview').then((m) => ({ default: m.Overview })));
const Tenants = lazy(() => import('./pages/Tenants').then((m) => ({ default: m.Tenants })));
const PlatformUsers = lazy(() =>
  import('./pages/PlatformUsers').then((m) => ({ default: m.PlatformUsers }))
);
const Plans = lazy(() => import('./pages/Plans').then((m) => ({ default: m.Plans })));
const NotFound = lazy(() => import('./pages/NotFound').then((m) => ({ default: m.NotFound })));

function RouteFallback() {
  return (
    <div className="flex h-full min-h-[40vh] w-full items-center justify-center bg-transparent text-foreground">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 rounded-full border-2 border-purple-500 border-t-transparent animate-spin" />
        <span className="text-xs text-muted-foreground font-mono">Loading section…</span>
      </div>
    </div>
  );
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, user } = useAuthStore();

  if (isLoading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-[#09090b] text-foreground">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-purple-500 border-t-transparent animate-spin" />
          <span className="text-xs text-muted-foreground font-mono">
            Authenticating Super Admin...
          </span>
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
    <RootErrorBoundary>
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
            <Route
              index
              element={
                <Suspense fallback={<RouteFallback />}>
                  <Overview />
                </Suspense>
              }
            />
            <Route
              path="tenants"
              element={
                <Suspense fallback={<RouteFallback />}>
                  <Tenants />
                </Suspense>
              }
            />
            <Route
              path="users"
              element={
                <Suspense fallback={<RouteFallback />}>
                  <PlatformUsers />
                </Suspense>
              }
            />
            <Route
              path="plans"
              element={
                <Suspense fallback={<RouteFallback />}>
                  <Plans />
                </Suspense>
              }
            />
          </Route>

          <Route
            path="*"
            element={
              <Suspense fallback={<RouteFallback />}>
                <NotFound />
              </Suspense>
            }
          />
        </Routes>
        <Toaster richColors position="bottom-right" closeButton theme="dark" />
      </BrowserRouter>
    </RootErrorBoundary>
  );
}
