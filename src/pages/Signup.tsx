import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';

export default function Signup({ onToggle }: { onToggle: () => void }) {
  const { signUp } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      setLoading(false);
      return;
    }

    const { error } = await signUp(email, password, name);

    if (error) {
      setError(error.message);
    }

    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-[rgb(var(--color-app-bg))] flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center mb-8">
          <img src="/PipelineIQ.png" alt="PipelineIQ" className="h-16" />
        </div>
        <h2 className="text-center text-2xl font-semibold text-gray-900 mb-2">
          Create your account
        </h2>
        <p className="text-center hig-text-caption">
          Get started with PipelineIQ today.
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
              />
            </div>

            <div>
              <label htmlFor="email" className="hig-label">
                Email address
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="hig-input"
                placeholder="you@example.com"
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
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="hig-btn-primary w-full"
            >
              {loading ? 'Creating account...' : 'Create account'}
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
                Sign in
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
