import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { Mail, Lock, Eye, EyeOff, BarChart3, DollarSign, Sparkles, TrendingUp } from 'lucide-react';

interface LoginProps {
  onToggle: () => void;
}

export default function Login({ onToggle }: LoginProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError(error.message);
    }

    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-[#e8eaed] flex items-center justify-center p-4 lg:p-8">
      {/* Main card container */}
      <div className="w-full max-w-5xl bg-white rounded-3xl shadow-2xl shadow-black/30 overflow-hidden flex flex-col lg:flex-row">
        
        {/* Left Panel - Login Form */}
        <div className="w-full lg:w-1/2 p-8 lg:p-12 xl:p-16">
          {/* Logo */}
          <div className="mb-10 flex justify-center">
            <img src="/LumaIQ.png" alt="Luma-IQ" className="h-10" />
          </div>

          {/* Header */}
          <div className="mb-8">
            <h1 className="text-2xl lg:text-3xl font-bold text-gray-900 mb-2">
              Log in to your account
            </h1>
            <p className="text-gray-500">
              Welcome back. Enter your credentials to continue.
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="bg-red-50 border border-red-200/60 text-red-700 px-4 py-3 rounded-xl text-sm">
                {error}
              </div>
            )}

            {/* Email Field */}
            <div>
              <label htmlFor="email" className="block text-sm font-medium mb-2" style={{ color: '#1e3a5f' }}>
                Email
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <Mail className="h-5 w-5" style={{ color: 'rgba(30, 58, 95, 0.4)' }} />
                </div>
                <input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-11 pr-4 py-3 border border-gray-200 rounded-xl transition-all bg-gray-50/50 hover:border-gray-300 focus:outline-none focus:ring-2 focus:border-transparent"
                  style={{ color: '#1e3a5f' }}
                  onFocus={(e) => e.target.style.boxShadow = '0 0 0 3px rgba(212, 136, 58, 0.2)'}
                  onBlur={(e) => e.target.style.boxShadow = 'none'}
                  placeholder="Enter your email"
                />
              </div>
            </div>

            {/* Password Field */}
            <div>
              <label htmlFor="password" className="block text-sm font-medium mb-2" style={{ color: '#1e3a5f' }}>
                Password
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <Lock className="h-5 w-5" style={{ color: 'rgba(30, 58, 95, 0.4)' }} />
                </div>
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-11 pr-12 py-3 border border-gray-200 rounded-xl transition-all bg-gray-50/50 hover:border-gray-300 focus:outline-none focus:ring-2 focus:border-transparent"
                  style={{ color: '#1e3a5f' }}
                  onFocus={(e) => e.target.style.boxShadow = '0 0 0 3px rgba(212, 136, 58, 0.2)'}
                  onBlur={(e) => e.target.style.boxShadow = 'none'}
                  placeholder="Enter your password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-4 flex items-center transition-colors"
                  style={{ color: 'rgba(30, 58, 95, 0.4)' }}
                  onMouseEnter={(e) => e.currentTarget.style.color = '#D4883A'}
                  onMouseLeave={(e) => e.currentTarget.style.color = 'rgba(30, 58, 95, 0.4)'}
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>

            {/* Remember me & Forgot password */}
            <div className="flex items-center justify-between">
              <label className="flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300 text-orange-500 focus:ring-orange-400"
                />
                <span className="ml-2 text-sm text-gray-600">Remember me</span>
              </label>
              <a 
                href="#" 
                className="text-sm font-medium transition-colors"
                style={{ color: '#1e3a5f' }}
                onMouseEnter={(e) => e.currentTarget.style.color = '#D4883A'}
                onMouseLeave={(e) => e.currentTarget.style.color = '#1e3a5f'}
              >
                Forgot password?
              </a>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 px-4 rounded-xl font-semibold text-white transition-all disabled:opacity-50 hover:shadow-lg flex items-center justify-center gap-2"
              style={{ backgroundColor: '#1e3a5f' }}
              onMouseEnter={(e) => !loading && (e.currentTarget.style.backgroundColor = '#D4883A')}
              onMouseLeave={(e) => !loading && (e.currentTarget.style.backgroundColor = '#1e3a5f')}
            >
              {loading ? 'Logging in...' : (
                <>
                  Log in
                  <span className="text-lg">→</span>
                </>
              )}
            </button>
          </form>

          {/* Create account link */}
          <div className="mt-8 text-center">
            <span style={{ color: 'rgba(30, 58, 95, 0.6)' }}>Don't have an account? </span>
            <button
              onClick={onToggle}
              className="font-semibold transition-colors"
              style={{ color: '#1e3a5f' }}
              onMouseEnter={(e) => e.currentTarget.style.color = '#D4883A'}
              onMouseLeave={(e) => e.currentTarget.style.color = '#1e3a5f'}
            >
              Create an account
            </button>
          </div>
        </div>

        {/* Right Panel - Branding */}
        <div 
          className="hidden lg:flex lg:w-1/2 flex-col justify-between p-10 xl:p-14 relative overflow-hidden"
          style={{ backgroundColor: '#0f1c2e' }}
        >
          {/* Ambient glow */}
          <div className="pointer-events-none absolute -top-20 -right-20 h-60 w-60 rounded-full bg-[#D4883A]/15 blur-[100px]" />
          <div className="pointer-events-none absolute bottom-0 left-0 h-48 w-48 rounded-full bg-[#2d5a8a]/20 blur-[80px]" />

          {/* Top: tagline */}
          <div>
            <h2 className="text-2xl xl:text-3xl font-bold text-white leading-tight">
              Your deals.{' '}
              <span className="text-[#D4883A]">In focus.</span>
            </h2>
            <p className="mt-3 text-white/50 text-sm xl:text-base max-w-xs leading-relaxed">
              Pipeline, commissions, and insights — in one view.
            </p>
          </div>

          {/* Middle: Mini dashboard cards */}
          <div className="mt-8 space-y-3 relative z-10">
            <div className="rounded-xl border border-white/[0.08] bg-[#162a42] p-4">
              <div className="flex items-center gap-3">
                <div className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-[#D4883A]/15 text-[#D4883A]">
                  <BarChart3 className="h-4 w-4" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-white">Pipeline value</span>
                    <span className="text-xs font-semibold text-emerald-400">+12%</span>
                  </div>
                  <div className="mt-1 text-lg font-bold text-white">$1.8M</div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-white/[0.08] bg-[#162a42] p-4">
                <div className="flex items-center gap-2 mb-2">
                  <DollarSign className="h-3.5 w-3.5 text-emerald-400" />
                  <span className="text-xs font-medium text-gray-400">YTD GCI</span>
                </div>
                <div className="text-lg font-bold text-white">$142K</div>
              </div>
              <div className="rounded-xl border border-white/[0.08] bg-[#162a42] p-4">
                <div className="flex items-center gap-2 mb-2">
                  <TrendingUp className="h-3.5 w-3.5 text-[#D4883A]" />
                  <span className="text-xs font-medium text-gray-400">Close rate</span>
                </div>
                <div className="text-lg font-bold text-white">28%</div>
              </div>
            </div>

            <div className="rounded-xl border border-white/[0.08] bg-[#162a42] p-4">
              <div className="flex items-start gap-3">
                <div className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#D4883A]/15 text-[#D4883A]">
                  <Sparkles className="h-3.5 w-3.5" />
                </div>
                <div>
                  <div className="text-xs font-semibold text-white">Luma AI Insight</div>
                  <div className="mt-0.5 text-xs leading-relaxed text-gray-500">
                    3 deals stalled 14+ days. Follow up to recover $240K in pipeline value.
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Bottom: accent bar */}
          <div className="mt-8 flex items-center gap-3">
            <div className="h-1 w-10 rounded-full bg-[#D4883A]" />
            <div className="h-1 w-3 rounded-full bg-white/20" />
            <div className="h-1 w-3 rounded-full bg-white/20" />
          </div>
        </div>
      </div>
    </div>
  );
}
