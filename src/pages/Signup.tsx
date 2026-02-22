import { useState, useEffect, useMemo } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { isValidSubdomainFormat } from '../lib/tenant';
import { PLANS } from '../config/plans';

const RESERVATION_EXPIRY_MINUTES = 30;

export default function Signup() {
  const location = useLocation();
  const planCode = useMemo(() => {
    const search = typeof window !== 'undefined' ? window.location.search : location.search;
    const params = new URLSearchParams(search);
    const code = params.get('plan') ?? 'independent';
    return code;
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
    } catch (err) {
      setError('Network error. Please try again.');
    }
    setLoading(false);
  };

  if (isEnterprise) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
        <div className="text-center">
          <p className="text-gray-600">Redirecting to contact sales…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-8">
        <div className="mb-6 flex justify-center">
          <img src="/LumaIQ.png" alt="Luma-IQ" className="h-9" />
        </div>
        <h1 className="text-xl font-bold text-gray-900 mb-2">Create your workspace</h1>
        <p className="text-sm text-gray-500 mb-6">
          Plan: {plan.name}
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Workspace name</label>
            <input
              type="text"
              value={workspaceName}
              onChange={(e) => setWorkspaceName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1e3a5f] focus:border-transparent"
              placeholder="My Team"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Subdomain</label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={subdomain}
                onChange={(e) => {
                  setSubdomain(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''));
                  setSubdomainError('');
                }}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1e3a5f] focus:border-transparent"
                placeholder="myteam"
              />
              <span className="text-gray-500 text-sm">.luma-iq.ai</span>
            </div>
            {subdomainError && <p className="mt-1 text-sm text-red-600">{subdomainError}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Your email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1e3a5f] focus:border-transparent"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1e3a5f] focus:border-transparent"
              minLength={8}
              required
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 px-4 bg-[#1e3a5f] text-white rounded-xl font-medium hover:opacity-90 disabled:opacity-50"
          >
            {loading ? 'Setting up…' : plan.cta}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-gray-500">
          Already have an account?{' '}
          <Link to="/login" className="text-[#1e3a5f] font-medium hover:underline">
            Log in
          </Link>
        </p>
      </div>
    </div>
  );
}
