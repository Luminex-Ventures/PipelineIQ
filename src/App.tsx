import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
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
const MarketIntelligence = lazy(() => import('./pages/MarketIntelligence'));
const PropertyValuationPage = lazy(() => import('./pages/PropertyValuation'));
const AcceptInvite = lazy(() => import('./pages/AcceptInvite'));
const ConversationsLayout = lazy(() => import('./pages/Conversations'));
const ConversationsInbox = lazy(() => import('./features/conversations/InboxPage').then((m) => ({ default: m.InboxPage })));
const ConversationsCampaigns = lazy(() => import('./features/conversations/CampaignsPage').then((m) => ({ default: m.CampaignsPage })));
const Marketing = lazy(() => import('./pages/Marketing'));
const MarketingLayout = lazy(() => import('./pages/MarketingLayout'));
const Pricing = lazy(() => import('./pages/Pricing'));
const SignupSaaS = lazy(() => import('./pages/Signup'));
const Setup = lazy(() => import('./pages/Setup'));
const ContactSales = lazy(() => import('./pages/ContactSales'));
const LegalTerms = lazy(() => import('./pages/LegalTerms'));
const LegalPrivacy = lazy(() => import('./pages/LegalPrivacy'));
const Billing = lazy(() => import('./pages/Billing'));
const Onboarding = lazy(() => import('./pages/Onboarding'));
const Landing = lazy(() => import('./pages/Landing'));

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

function SignupRoute() {
  const location = useLocation();
  return (
    <Suspense fallback={<AuthSkeleton />}>
      <SignupSaaS key={location.pathname + location.search} />
    </Suspense>
  );
}

function HomeRoute() {
  const { user, loading } = useAuth();
  if (loading) {
    return <AppShellSkeleton />;
  }
  if (user) {
    return (
      <ProtectedRoute>
        <Dashboard />
      </ProtectedRoute>
    );
  }
  return (
    <Suspense fallback={<AuthSkeleton />}>
      <Landing />
    </Suspense>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Toaster position="top-center" />
      <BrowserRouter>
        <Routes>
          <Route path="/pricing" element={<Suspense fallback={<AuthSkeleton />}><Pricing /></Suspense>} />
          <Route path="/signup" element={<SignupRoute />} />
          <Route path="/setup" element={<Suspense fallback={<AuthSkeleton />}><Setup /></Suspense>} />
          <Route path="/contact-sales" element={<Suspense fallback={<AuthSkeleton />}><ContactSales /></Suspense>} />
          <Route path="/legal/terms" element={<Suspense fallback={<AuthSkeleton />}><LegalTerms /></Suspense>} />
          <Route path="/legal/privacy" element={<Suspense fallback={<AuthSkeleton />}><LegalPrivacy /></Suspense>} />
          <Route
            path="/login"
            element={
              <AuthRoute>
                <AuthPages />
              </AuthRoute>
            }
          />
          <Route path="/" element={<HomeRoute />} />
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
            path="/onboarding"
            element={
              <ProtectedRoute>
                <Onboarding />
              </ProtectedRoute>
            }
          />
          <Route
            path="/billing"
            element={
              <ProtectedRoute>
                <Billing />
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
          <Route
            path="/market-intelligence"
            element={
              <ProtectedRoute>
                <MarketIntelligence />
              </ProtectedRoute>
            }
          />
          <Route
            path="/property-valuation"
            element={
              <ProtectedRoute>
                <PropertyValuationPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/conversations"
            element={
              <ProtectedRoute>
                <ConversationsLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Navigate to="/conversations/inbox" replace />} />
            <Route path="inbox" element={<ConversationsInbox />} />
            <Route path="connected-accounts" element={<Navigate to="/workspace-settings?section=integrations" replace />} />
          </Route>
          <Route
            path="/campaigns"
            element={
              <ProtectedRoute>
                <ConversationsCampaigns />
              </ProtectedRoute>
            }
          />
          <Route
            path="/marketing"
            element={
              <ProtectedRoute>
                <MarketingLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Marketing />} />
            <Route path="connected-accounts" element={<Navigate to="/workspace-settings?section=integrations" replace />} />
          </Route>
          <Route path="/home-value-estimator" element={<Navigate to="/property-valuation" replace />} />
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
