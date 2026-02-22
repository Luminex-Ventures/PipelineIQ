import { useState, useEffect, useMemo } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { isValidSubdomainFormat } from '../lib/tenant';
import { PLANS } from '../config/plans';

const RESERVATION_EXPIRY_MINUTES = 30;

export default function Signup() {
  const location = useLocation();
  const planCode = useMemo(() => {
    const search = typeof window !== 'undefined' ? window.location.search : location.search;
    const params = new URLSearchParams(search);
    return params.get('plan') ?? 'independent';
  }, [location.search]);

  const [workspaceName, setWorkspaceName] = useState('');
  const [subdomain, setSubdomain] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [subdomainError, setSubdomainError] = useState('');

  const plan = PLANS.find((p) => p.code === planCode) ?? PLANS[0];
  const isEnterprise = plan.isEnterprise;

  useEffect(() => {
    if (isEnterprise) {
      window.location.href = `/contact-sales?plan=${planCode}`;
    }
  }, [isEnterprise, planCode]);

  const checkSubdomain = async () => {
    const norm = subdomain.toLowerCase().trim();
    if (!isValidSubdomainFormat(norm)) {
      setSubdomainError('Use 3–30 characters: letters, numbers, hyphens (no hyphen at start/end).');
      return false;
    }
    const { data, error: rpcError } = await supabase.rpc('saas_subdomain_available', {
      p_subdomain: norm,
    });
    if (rpcError) {
      setSubdomainError('Could not check availability.');
      return false;
    }
    if (!data) {
      setSubdomainError('This subdomain is taken or reserved.');
      return false;
    }
    setSubdomainError('');
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const normSub = subdomain.toLowerCase().trim();
    if (!isValidSubdomainFormat(normSub)) {
      setSubdomainError('Invalid subdomain format.');
      setLoading(false);
      return;
    }

    const ok = await checkSubdomain();
    if (!ok) {
      setLoading(false);
      return;
    }

    const { data: userData, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: workspaceName } },
    });

    if (signUpError) {
      setError(signUpError.message);
      setLoading(false);
      return;
    }

    if (!userData.user) {
      setError('Sign up failed. Please try again.');
      setLoading(false);
      return;
    }

    const expiresAt = new Date(Date.now() + RESERVATION_EXPIRY_MINUTES * 60 * 1000).toISOString();

    const { data: reservation, error: resErr } = await supabase
      .from('tenant_reservations')
      .insert({
        subdomain: normSub,
        plan_code: planCode,
        workspace_name: workspaceName || normSub,
        owner_email: email,
        owner_user_id: userData.user.id,
        state: 'reserved',
        expires_at: expiresAt,
      })
      .select('id')
      .single();

    if (resErr || !reservation) {
      setError(resErr?.message ?? 'Failed to reserve workspace.');
      setLoading(false);
      return;
    }

    try {
      const { data, error: fnError } = await supabase.functions.invoke('saas_create_checkout', {
        body: { reservation_id: reservation.id },
      });

      if (fnError) {
        setError(fnError.message ?? 'Checkout could not be started.');
        setLoading(false);
        return;
      }

      const url = data?.url;
      if (url) {
        window.location.href = url;
        return;
      }

      setError(data?.error ?? 'No checkout URL received.');
    } catch {
      setError('Network error. Please try again.');
    }
    setLoading(false);
  };

  if (isEnterprise) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#fafbfe] p-4">
        <p className="text-sm text-slate-500">Redirecting to contact sales...</p>
      </div>
    );
  }

  const inputClass =
    'w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-[15px] text-slate-900 placeholder:text-slate-400 transition focus:border-[#D4883A] focus:outline-none focus:ring-2 focus:ring-[#D4883A]/20';

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-[#fafbfe] p-4 antialiased selection:bg-[#D4883A]/20 lg:p-8">
      {/* ambient background */}
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="animate-float absolute -top-32 left-1/2 h-[700px] w-[700px] -translate-x-1/2 rounded-full bg-[#1e3a5f]/[0.07] blur-[140px]" />
        <div className="animate-float-slow absolute top-[40%] -right-40 h-[500px] w-[500px] rounded-full bg-[#D4883A]/[0.06] blur-[140px]" />
      </div>

      <div className="w-full max-w-md rounded-2xl border border-white/60 bg-white/80 p-8 shadow-[0_2px_4px_rgba(15,23,42,0.04),0_24px_68px_rgba(15,23,42,0.08)] backdrop-blur-sm md:p-10">
        {/* logo → home */}
        <div className="mb-8">
          <Link to="/" className="inline-flex items-center gap-2">
            <img src="/LumaIQ.png" alt="Luma-IQ" className="h-9" />
          </Link>
        </div>

        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">
          Create your workspace
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          Plan:{' '}
          <span className="font-semibold text-[#1e3a5f]">{plan.name}</span>
        </p>

        <form onSubmit={handleSubmit} className="mt-8 space-y-5">
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-slate-700">
              Workspace name
            </label>
            <input
              type="text"
              value={workspaceName}
              onChange={(e) => setWorkspaceName(e.target.value)}
              className={inputClass}
              placeholder="My Team"
              required
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-semibold text-slate-700">
              Subdomain
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={subdomain}
                onChange={(e) => {
                  setSubdomain(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''));
                  setSubdomainError('');
                }}
                className={`flex-1 ${inputClass}`}
                placeholder="myteam"
              />
              <span className="shrink-0 text-sm text-slate-400">.luma-iq.ai</span>
            </div>
            {subdomainError && (
              <p className="mt-1.5 text-sm font-medium text-red-600">{subdomainError}</p>
            )}
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-semibold text-slate-700">
              Your email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputClass}
              placeholder="you@example.com"
              required
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-semibold text-slate-700">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputClass}
              placeholder="At least 8 characters"
              minLength={8}
              required
            />
          </div>

          {error && (
            <div className="rounded-xl border border-red-200/60 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="flex w-full items-center justify-center gap-2.5 rounded-full bg-[#1e3a5f] py-3.5 text-sm font-semibold text-white shadow-md shadow-[#1e3a5f]/15 transition-all hover:brightness-110 disabled:opacity-50"
          >
            {loading ? 'Setting up...' : (
              <>{plan.cta} <ArrowRight className="h-4 w-4" /></>
            )}
          </button>
        </form>

        <p className="mt-8 text-center text-sm text-slate-500">
          Already have an account?{' '}
          <Link
            to="/login"
            className="font-semibold text-[#1e3a5f] transition-colors hover:text-[#D4883A]"
          >
            Log in
          </Link>
        </p>
      </div>
    </div>
  );
}
