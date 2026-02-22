import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

export default function Onboarding() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [orgName, setOrgName] = useState('');
  const [timezone, setTimezone] = useState('America/Los_Angeles');
  const [teamName, setTeamName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const { data: ws } = await supabase
      .from('workspace_settings')
      .select('id, name, timezone')
      .eq('owner_user_id', user?.id)
      .maybeSingle();

    if (ws) {
      await supabase
        .from('workspace_settings')
        .update({
          name: orgName || ws.name,
          timezone,
        })
        .eq('id', ws.id);
    }

    setLoading(false);
    navigate('/', { replace: true });
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-8">
        <div className="mb-6 flex justify-center">
          <img src="/LumaIQ.png" alt="Luma-IQ" className="h-9" />
        </div>
        <h1 className="text-xl font-bold text-gray-900 mb-2">Welcome to Luma-IQ</h1>
        <p className="text-sm text-gray-500 mb-6">
          Confirm a few details to get started.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Workspace name</label>
            <input
              type="text"
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1e3a5f] focus:border-transparent"
              placeholder="My Workspace"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Timezone</label>
            <select
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1e3a5f] focus:border-transparent"
            >
              <option value="America/Los_Angeles">Pacific</option>
              <option value="America/Denver">Mountain</option>
              <option value="America/Chicago">Central</option>
              <option value="America/New_York">Eastern</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Team name (optional)</label>
            <input
              type="text"
              value={teamName}
              onChange={(e) => setTeamName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1e3a5f] focus:border-transparent"
              placeholder="My Team"
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 px-4 bg-[#1e3a5f] text-white rounded-xl font-medium hover:opacity-90 disabled:opacity-50"
          >
            {loading ? 'Saving…' : 'Continue'}
          </button>
        </form>
      </div>
    </div>
  );
}
