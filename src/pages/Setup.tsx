import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getTenantAppUrl } from '../lib/tenant';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL ?? '';
const POLL_INTERVAL_MS = 2000;

export default function Setup() {
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get('session_id');
  const [status, setStatus] = useState<{ state: string; subdomain: string; ready: boolean } | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!sessionId) {
      setError('Missing session. Return to signup and try again.');
      return;
    }

    const poll = async () => {
      try {
        const res = await fetch(
          `${SUPABASE_URL}/functions/v1/saas_provisioning_status?session_id=${encodeURIComponent(sessionId)}`
        );
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(data.error ?? 'Could not load status.');
          return;
        }
        setStatus(data);
        if (data.ready && data.subdomain) {
          window.location.href = getTenantAppUrl(data.subdomain);
        }
      } catch {
        setError('Network error.');
      }
    };

    poll();
    const id = setInterval(poll, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [sessionId]);

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-8 text-center">
        <div className="mb-6 flex justify-center">
          <img src="/LumaIQ.png" alt="Luma-IQ" className="h-9" />
        </div>
        {error ? (
          <>
            <h1 className="text-xl font-bold text-gray-900 mb-2">Something went wrong</h1>
            <p className="text-gray-600 mb-6">{error}</p>
            <a
              href="/signup"
              className="inline-block py-2 px-4 bg-[#1e3a5f] text-white rounded-lg font-medium hover:opacity-90"
            >
              Back to signup
            </a>
          </>
        ) : status ? (
          <>
            <h1 className="text-xl font-bold text-gray-900 mb-2">Setting up your workspace</h1>
            <p className="text-gray-600 mb-6">
              {status.state === 'active'
                ? 'Redirecting…'
                : `Status: ${status.state.replace(/_/g, ' ')}. This usually takes a few seconds.`}
            </p>
            <div className="flex justify-center">
              <div className="w-10 h-10 border-2 border-[#1e3a5f] border-t-transparent rounded-full animate-spin" />
            </div>
          </>
        ) : (
          <>
            <h1 className="text-xl font-bold text-gray-900 mb-2">Checking status…</h1>
            <p className="text-gray-600 mb-6">Your workspace is being provisioned.</p>
            <div className="flex justify-center">
              <div className="w-10 h-10 border-2 border-gray-300 border-t-[#1e3a5f] rounded-full animate-spin" />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
