import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

interface SubscriptionRow {
  id: string;
  plan_code: string;
  status: string;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
}

export default function Billing() {
  const [sub, setSub] = useState<SubscriptionRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      const { data, error: err } = await supabase
        .from('saas_subscriptions')
        .select('id, plan_code, status, current_period_end, cancel_at_period_end')
        .maybeSingle();
      if (err) {
        setError(err.message);
        setLoading(false);
        return;
      }
      setSub(data as SubscriptionRow | null);
      setLoading(false);
    })();
  }, []);

  if (loading) {
    return (
      <div className="p-6">
        <div className="h-8 w-48 bg-gray-100 rounded animate-pulse" />
        <div className="mt-4 h-4 w-64 bg-gray-100 rounded animate-pulse" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-2xl">
      <h1 className="text-xl font-bold text-gray-900 mb-2">Billing</h1>
      <p className="text-gray-600 text-sm mb-6">
        Manage your subscription and billing. Only owners and admins can access this page.
      </p>

      {error && (
        <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm">
          {error}
        </div>
      )}

      {!sub ? (
        <div className="p-6 border border-gray-200 rounded-xl bg-gray-50 text-gray-600">
          No active subscription. If you just signed up, refresh the page after provisioning completes.
        </div>
      ) : (
        <div className="border border-gray-200 rounded-xl overflow-hidden">
          <div className="p-4 border-b border-gray-200 flex justify-between items-center">
            <span className="font-medium text-gray-900">Plan</span>
            <span className="text-gray-700 capitalize">{sub.plan_code.replace(/_/g, ' ')}</span>
          </div>
          <div className="p-4 border-b border-gray-200 flex justify-between items-center">
            <span className="font-medium text-gray-900">Status</span>
            <span className="capitalize">{sub.status}</span>
          </div>
          {sub.current_period_end && (
            <div className="p-4 border-b border-gray-200 flex justify-between items-center">
              <span className="font-medium text-gray-900">Current period ends</span>
              <span className="text-gray-700">
                {new Date(sub.current_period_end).toLocaleDateString()}
              </span>
            </div>
          )}
          {sub.cancel_at_period_end && (
            <div className="p-4 bg-amber-50 text-amber-800 text-sm">
              Subscription will cancel at the end of the current period.
            </div>
          )}
          <div className="p-4">
            <a
              href="#"
              className="text-[#1e3a5f] font-medium hover:underline"
              onClick={(e) => {
                e.preventDefault();
                // TODO: open Stripe Customer Portal (backend creates session, redirect to url)
              }}
            >
              Manage subscription →
            </a>
            <p className="text-xs text-gray-500 mt-1">
              Opens your billing portal to update payment method or cancel.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
