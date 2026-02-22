import { useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import {
  ArrowRight,
  BarChart3,
  DollarSign,
  Eye,
  EyeOff,
  Lock,
  Mail,
  Sparkles,
  TrendingUp,
} from 'lucide-react';

interface LoginProps {
  onToggle: () => void;
}

export default function Login({ onToggle }: LoginProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const { error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (authError) {
      setError(authError.message);
    }

    setLoading(false);
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-[#fafbfe] p-4 antialiased selection:bg-[#D4883A]/20 lg:p-8">
      {/* ambient background */}
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="animate-float absolute -top-32 left-1/2 h-[700px] w-[700px] -translate-x-1/2 rounded-full bg-[#1e3a5f]/[0.07] blur-[140px]" />
        <div className="animate-float-slow absolute top-[40%] -right-40 h-[500px] w-[500px] rounded-full bg-[#D4883A]/[0.06] blur-[140px]" />
      </div>

      <div className="w-full max-w-5xl overflow-hidden rounded-2xl border border-white/60 bg-white/80 shadow-[0_2px_4px_rgba(15,23,42,0.04),0_24px_68px_rgba(15,23,42,0.08)] backdrop-blur-sm lg:flex">
        {/* ── left: form ── */}
        <div className="w-full p-8 lg:w-1/2 lg:p-12 xl:p-16">
          {/* logo → home */}
          <div className="mb-10">
            <Link to="/" className="inline-flex items-center gap-2">
              <img src="/LumaIQ.png" alt="Luma-IQ" className="h-9" />
            </Link>
          </div>

          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 lg:text-3xl">
            Welcome back
          </h1>
          <p className="mt-2 text-[15px] text-slate-500">
            Enter your credentials to continue.
          </p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-5">
            {error && (
              <div className="rounded-xl border border-red-200/60 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                {error}
              </div>
            )}

            {/* email */}
            <div>
              <label htmlFor="login-email" className="mb-1.5 block text-sm font-semibold text-slate-700">
                Email
              </label>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4">
                  <Mail className="h-[18px] w-[18px] text-slate-300" />
                </div>
                <input
                  id="login-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-11 pr-4 text-[15px] text-slate-900 placeholder:text-slate-400 transition focus:border-[#D4883A] focus:outline-none focus:ring-2 focus:ring-[#D4883A]/20"
                />
              </div>
            </div>

            {/* password */}
            <div>
              <label htmlFor="login-password" className="mb-1.5 block text-sm font-semibold text-slate-700">
                Password
              </label>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4">
                  <Lock className="h-[18px] w-[18px] text-slate-300" />
                </div>
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-11 pr-12 text-[15px] text-slate-900 placeholder:text-slate-400 transition focus:border-[#D4883A] focus:outline-none focus:ring-2 focus:ring-[#D4883A]/20"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 flex items-center pr-4 text-slate-400 transition-colors hover:text-[#D4883A]"
                >
                  {showPassword ? <EyeOff className="h-[18px] w-[18px]" /> : <Eye className="h-[18px] w-[18px]" />}
                </button>
              </div>
            </div>

            {/* forgot */}
            <div className="flex items-center justify-end">
              <a
                href="#"
                className="text-sm font-medium text-[#1e3a5f] transition-colors hover:text-[#D4883A]"
              >
                Forgot password?
              </a>
            </div>

            {/* submit */}
            <button
              type="submit"
              disabled={loading}
              className="flex w-full items-center justify-center gap-2.5 rounded-full bg-[#1e3a5f] py-3.5 text-sm font-semibold text-white shadow-md shadow-[#1e3a5f]/15 transition-all hover:brightness-110 disabled:opacity-50"
            >
              {loading ? 'Logging in...' : (
                <>Log in <ArrowRight className="h-4 w-4" /></>
              )}
            </button>
          </form>

          {/* toggle to signup */}
          <p className="mt-8 text-center text-sm text-slate-500">
            Don&apos;t have an account?{' '}
            <button
              onClick={onToggle}
              className="font-semibold text-[#1e3a5f] transition-colors hover:text-[#D4883A]"
            >
              Create one
            </button>
          </p>
        </div>

        {/* ── right: branded panel ── */}
        <div className="relative hidden overflow-hidden bg-gradient-to-br from-[#0f1f33] via-[#152d4a] to-[#1e3a5f] lg:flex lg:w-1/2 lg:flex-col lg:justify-between lg:p-10 xl:p-14">
          {/* dot grid */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              backgroundImage:
                'radial-gradient(circle, rgba(255,255,255,0.04) 1px, transparent 1px)',
              backgroundSize: '24px 24px',
            }}
          />
          {/* ambient glow */}
          <div aria-hidden className="animate-float pointer-events-none absolute -right-20 -top-20 h-60 w-60 rounded-full bg-[#D4883A]/15 blur-[100px]" />
          <div aria-hidden className="animate-float-slow pointer-events-none absolute -bottom-16 -left-16 h-48 w-48 rounded-full bg-indigo-500/10 blur-[80px]" />

          {/* tagline */}
          <div className="relative z-10">
            <h2 className="text-2xl font-extrabold leading-tight text-white xl:text-3xl">
              Your deals.{' '}
              <span className="bg-gradient-to-r from-[#D4883A] to-[#e8a45a] bg-clip-text text-transparent">
                In focus.
              </span>
            </h2>
            <p className="mt-3 max-w-xs text-sm leading-relaxed text-white/40 xl:text-[15px]">
              Pipeline, commissions, and AI-powered insights — in one view.
            </p>
          </div>

          {/* mini dashboard */}
          <div className="relative z-10 mt-8 space-y-3">
            <div className="rounded-xl border border-white/[0.08] bg-white/[0.04] p-4 backdrop-blur-sm">
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
              <div className="rounded-xl border border-white/[0.08] bg-white/[0.04] p-4 backdrop-blur-sm">
                <div className="mb-2 flex items-center gap-2">
                  <DollarSign className="h-3.5 w-3.5 text-emerald-400" />
                  <span className="text-xs font-medium text-white/40">YTD GCI</span>
                </div>
                <div className="text-lg font-bold text-white">$142K</div>
              </div>
              <div className="rounded-xl border border-white/[0.08] bg-white/[0.04] p-4 backdrop-blur-sm">
                <div className="mb-2 flex items-center gap-2">
                  <TrendingUp className="h-3.5 w-3.5 text-[#D4883A]" />
                  <span className="text-xs font-medium text-white/40">Close rate</span>
                </div>
                <div className="text-lg font-bold text-white">28%</div>
              </div>
            </div>

            <div className="rounded-xl border border-white/[0.08] bg-white/[0.04] p-4 backdrop-blur-sm">
              <div className="flex items-start gap-3">
                <div className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#D4883A]/15 text-[#D4883A]">
                  <Sparkles className="h-3.5 w-3.5" />
                </div>
                <div>
                  <div className="text-xs font-semibold text-white">Luma AI Insight</div>
                  <div className="mt-0.5 text-xs leading-relaxed text-white/35">
                    3 deals stalled 14+ days. Follow up to recover $240K pipeline value.
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* accent dots */}
          <div className="relative z-10 mt-8 flex items-center gap-2">
            <div className="h-1.5 w-10 rounded-full bg-[#D4883A]" />
            <div className="h-1.5 w-3 rounded-full bg-white/15" />
            <div className="h-1.5 w-3 rounded-full bg-white/15" />
          </div>
        </div>
      </div>
    </div>
  );
}
