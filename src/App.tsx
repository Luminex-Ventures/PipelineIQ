import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { AppShell } from './components/layout/AppShell';
import { lazy, Suspense, useState } from 'react';

// Lazy-loaded pages — each becomes its own chunk
const Login = lazy(() => import('./pages/Login'));
const Signup = lazy(() => import('./pages/Signup'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Pipeline = lazy(() => import('./pages/Pipeline'));
const Analytics = lazy(() => import('./pages/Analytics'));
const Tasks = lazy(() => import('./pages/Tasks'));
const Luma = lazy(() => import('./pages/Luma'));
const WorkspaceSettings = lazy(() => import('./pages/WorkspaceSettings'));
const PersonalSettings = lazy(() => import('./pages/PersonalSettings'));
const ContractScribeComingSoon = lazy(() => import('./pages/ContractScribeComingSoon'));
const AcceptInvite = lazy(() => import('./pages/AcceptInvite'));

/* ─── Skeleton that mirrors the AppShell layout ─── */
function AppShellSkeleton() {
  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar placeholder */}
      <div className="w-60 h-screen bg-[#1e3a5f] flex-shrink-0" />
      {/* Main area */}
      <div className="flex-1 flex flex-col">
        {/* Header placeholder */}
        <div className="h-16 bg-[#1e3a5f] border-b border-white/10" />
        {/* Content area — empty, same bg as real pages */}
        <div className="flex-1 bg-white" />
      </div>
    </div>
  );
}

/* ─── Lightweight content skeleton shown while a page chunk streams in ─── */
function PageContentSkeleton() {
  return (
    <div className="p-6 lg:p-8 space-y-5 animate-pulse">
      <div className="h-7 w-44 bg-gray-100 rounded-lg" />
      <div className="h-4 w-72 bg-gray-100/70 rounded-lg" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-[88px] bg-gray-100/60 rounded-xl" />
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pt-2">
        <div className="h-56 bg-gray-100/50 rounded-xl" />
        <div className="h-56 bg-gray-100/50 rounded-xl" />
      </div>
    </div>
  );
}

/* ─── Auth-page skeleton (centered, minimal) ─── */
function AuthSkeleton() {
  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <div className="w-full max-w-5xl h-[600px] bg-white rounded-3xl shadow-2xl animate-pulse" />
    </div>
  );
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading, roleInfo, signOut } = useAuth();

  // While auth is resolving, show a skeleton that matches the AppShell shape.
  // No spinner, no layout shift — just a quiet placeholder.
  if (loading) {
    return <AppShellSkeleton />;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (roleInfo && roleInfo.isActive === false) {
    return (
      <div className="min-h-screen bg-[rgb(var(--color-app-bg))] flex items-center justify-center px-4">
        <div className="max-w-md rounded-2xl border border-[var(--app-border)] bg-white/90 p-6 text-center shadow-xl space-y-3">
          <p className="text-lg font-semibold text-gray-900">Account deactivated</p>
          <p className="text-sm text-gray-600">
            Your Luma-IQ access has been suspended. Please reach out to an administrator if you believe this is a mistake.
          </p>
          <button
            onClick={signOut}
            className="hig-btn-secondary mx-auto"
          >
            Back to login
          </button>
        </div>
      </div>
    );
  }

  // AppShell renders immediately (sidebar + header). Suspense inside keeps the
  // shell visible while the lazy page chunk loads — no full-screen flash.
  return (
    <AppShell>
      <Suspense fallback={<PageContentSkeleton />}>
        {children}
      </Suspense>
    </AppShell>
  );
}

function AuthRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return <AuthSkeleton />;
  }

  if (user) {
    return <Navigate to="/" replace />;
  }

  return (
    <Suspense fallback={<AuthSkeleton />}>
      {children}
    </Suspense>
  );
}

function AuthPages() {
  const [showLogin, setShowLogin] = useState(true);

  return showLogin ? (
    <Login onToggle={() => setShowLogin(false)} />
  ) : (
    <Signup onToggle={() => setShowLogin(true)} />
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route
            path="/login"
            element={
              <AuthRoute>
                <AuthPages />
              </AuthRoute>
            }
          />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/invite/:token"
            element={
              <AuthRoute>
                <AcceptInvite />
              </AuthRoute>
            }
          />
          <Route
            path="/pipeline"
            element={
              <ProtectedRoute>
                <Pipeline />
              </ProtectedRoute>
            }
          />
          <Route
            path="/tasks"
            element={
              <ProtectedRoute>
                <Tasks />
              </ProtectedRoute>
            }
          />
          <Route
            path="/luma"
            element={
              <ProtectedRoute>
                <Luma />
              </ProtectedRoute>
            }
          />
          <Route
            path="/analytics"
            element={
              <ProtectedRoute>
                <Analytics />
              </ProtectedRoute>
            }
          />
          <Route
            path="/workspace-settings"
            element={
              <ProtectedRoute>
                <WorkspaceSettings />
              </ProtectedRoute>
            }
          />
          <Route
            path="/settings"
            element={
              <ProtectedRoute>
                <PersonalSettings />
              </ProtectedRoute>
            }
          />
          <Route path="/lead-sources" element={<Navigate to="/workspace-settings" replace />} />
          <Route path="/pipeline-settings" element={<Navigate to="/workspace-settings" replace />} />
          <Route
            path="/contractscribe"
            element={
              <Suspense fallback={<AuthSkeleton />}>
                <ContractScribeComingSoon />
              </Suspense>
            }
          />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
