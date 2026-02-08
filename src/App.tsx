import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { AppShell } from './components/layout/AppShell';
import Login from './pages/Login';
import Signup from './pages/Signup';
import Dashboard from './pages/Dashboard';
import Pipeline from './pages/Pipeline';
import Analytics from './pages/Analytics';
import Tasks from './pages/Tasks';
import Luma from './pages/Luma';
import WorkspaceSettings from './pages/WorkspaceSettings';
import PersonalSettings from './pages/PersonalSettings';
import ContractScribeComingSoon from './pages/ContractScribeComingSoon';
import { useState } from 'react';
import AcceptInvite from './pages/AcceptInvite';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading, roleInfo, signOut } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-[rgb(var(--color-app-bg))] flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[var(--app-accent)]"></div>
      </div>
    );
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

  return <AppShell>{children}</AppShell>;
}

function AuthRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-[rgb(var(--color-app-bg))] flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[var(--app-accent)]"></div>
      </div>
    );
  }

  if (user) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
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
          <Route path="/contractscribe" element={<ContractScribeComingSoon />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
