import { useEffect, useMemo, useState, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { getRoleLabel } from '../lib/rbac';
import type { GlobalRole } from '../lib/database.types';
import { useSearchParams } from 'react-router-dom';

interface InvitePreview {
  email: string;
  intended_role: GlobalRole;
  workspace_name: string | null;
  expires_at: string;
  status: 'pending' | 'accepted' | 'canceled' | 'expired';
}

interface SignupProps {
  onToggle: () => void;
  presetToken?: string;
}

export default function Signup({ onToggle, presetToken }: SignupProps) {
  const { signUp } = useAuth();
  const [searchParams] = useSearchParams();
  const [name, setName] = useState('');
  const [inviteToken, setInviteToken] = useState(
    presetToken || searchParams.get('invite') || ''
  );
  const [inviteDetails, setInviteDetails] = useState<InvitePreview | null>(null);
  const [inviteMessage, setInviteMessage] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [validatingInvite, setValidatingInvite] = useState(false);

  useEffect(() => {
    if (presetToken && presetToken !== inviteToken) {
      setInviteToken(presetToken);
    }
  }, [presetToken, inviteToken]);

  const canSubmit = inviteDetails && !validatingInvite && !loading;

  const fetchInvite = useCallback(async (token: string) => {
    if (!token) {
      setInviteDetails(null);
      setInviteMessage('');
      setEmail('');
      return;
    }

    setValidatingInvite(true);
    setInviteMessage('');
    setInviteDetails(null);
    setError('');

    const { data, error } = await supabase.rpc<InvitePreview | InvitePreview[]>('get_invite_preview', {
      invite_token: token
    });

    if (error) {
      setInviteMessage('Unable to validate invite. Please check the code or contact your admin.');
      setValidatingInvite(false);
      return;
    }

    const record = Array.isArray(data) ? data[0] : data;

    if (!record) {
      setInviteMessage('No invitation found for this code.');
      setValidatingInvite(false);
      return;
    }

    if ((record as InvitePreview).status !== 'pending') {
      setInviteMessage('This invitation has already been used or canceled.');
      setValidatingInvite(false);
      return;
    }

    const expiresAt = new Date((record as InvitePreview).expires_at);
    if (expiresAt.getTime() < Date.now()) {
      setInviteMessage('This invitation has expired. Please ask your admin to resend.');
      setValidatingInvite(false);
      return;
    }

    setInviteDetails(record as InvitePreview);
    setEmail((record as InvitePreview).email);
    setInviteMessage('');
    setValidatingInvite(false);
  }, []);

  useEffect(() => {
    const debounce = setTimeout(() => {
      if (inviteToken && inviteToken.length >= 6) {
        fetchInvite(inviteToken.trim());
      } else {
        setInviteDetails(null);
        setEmail('');
      }
    }, 300);

    return () => clearTimeout(debounce);
  }, [inviteToken, fetchInvite]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    if (!inviteDetails || !inviteToken) {
      setError('A valid invite code is required to join the workspace.');
      setLoading(false);
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      setLoading(false);
      return;
    }

    const { error } = await signUp(email, password, name, inviteToken.trim());

    if (error) {
      setError(error.message);
    }

    setLoading(false);
  };

  const inviteWorkspaceLabel = useMemo(() => {
    if (!inviteDetails) return '';
    return inviteDetails.workspace_name || 'Workspace';
  }, [inviteDetails]);

  return (
    <div className="min-h-screen bg-[rgb(var(--color-app-bg))] flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center mb-8">
          <img src="/PipelineIQ.png" alt="PipelineIQ" className="h-16" />
        </div>
        <h2 className="text-center text-2xl font-semibold text-gray-900 mb-2">
          Accept your invitation
        </h2>
        <p className="text-center hig-text-caption">
          PipelineIQ access is invite-only. Paste the invite code from your email to continue.
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="hig-card p-8">
          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="bg-red-50 border border-red-200/60 text-red-700 px-4 py-3 rounded-xl text-sm">
                {error}
              </div>
            )}

            <div>
              <label htmlFor="invite" className="hig-label flex items-center justify-between">
                Invitation code
                {presetToken && (
                  <span className="text-[11px] text-gray-500">Autofilled from your link</span>
                )}
              </label>
              <input
                id="invite"
                type="text"
                required
                value={inviteToken}
                onChange={(e) => setInviteToken(e.target.value)}
                className="hig-input uppercase tracking-[0.3em]"
                placeholder="Paste your invite code"
              />
              {inviteMessage && (
                <p className="text-xs text-red-600 mt-1">{inviteMessage}</p>
              )}
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="hig-label">Email</label>
                <input
                  type="email"
                  value={email}
                  readOnly
                  className="hig-input bg-gray-50 text-gray-600"
                  placeholder="Invite required"
                />
              </div>
              <div>
                <label className="hig-label">Role</label>
                <input
                  type="text"
                  value={inviteDetails ? getRoleLabel(inviteDetails.intended_role) : ''}
                  readOnly
                  className="hig-input bg-gray-50 text-gray-600"
                  placeholder="Invite required"
                />
              </div>
            </div>

            {inviteDetails && (
              <div className="rounded-2xl border border-gray-200/70 bg-gray-50/70 px-4 py-3 text-sm text-gray-600">
                Joining <span className="font-semibold text-gray-900">{inviteWorkspaceLabel}</span> as{' '}
                <span className="font-semibold text-gray-900">
                  {getRoleLabel(inviteDetails.intended_role)}
                </span>
              </div>
            )}

            <div>
              <label htmlFor="name" className="hig-label">
                Full name
              </label>
              <input
                id="name"
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="hig-input"
                placeholder="John Doe"
                disabled={!inviteDetails}
              />
            </div>

            <div>
              <label htmlFor="password" className="hig-label">
                Password
              </label>
              <input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="hig-input"
                placeholder="At least 6 characters"
                disabled={!inviteDetails}
              />
            </div>

            <button
              type="submit"
              disabled={!canSubmit}
              className="hig-btn-primary w-full"
            >
              {loading ? 'Creating account...' : 'Join workspace'}
            </button>
          </form>

          <div className="mt-6">
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-200/60" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-white text-gray-500">
                  Already have an account?
                </span>
              </div>
            </div>

            <div className="mt-6">
              <button
                onClick={onToggle}
                className="hig-btn-secondary w-full"
              >
                Back to sign in
              </button>
              <p className="mt-3 text-center text-xs text-gray-500">
                Don’t have an invite? Contact an admin in your workspace.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
