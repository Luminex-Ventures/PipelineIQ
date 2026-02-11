import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { Mail, Lock, Eye, EyeOff } from 'lucide-react';

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
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4 lg:p-8">
      {/* Main card container */}
      <div className="w-full max-w-5xl bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col lg:flex-row">
        
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
              Welcome back! Select method to log in.
            </p>
          </div>

          {/* Social Login Buttons */}
          <div className="flex gap-3 mb-6">
            <button
              type="button"
              className="flex-1 flex items-center justify-center gap-2 py-3 px-4 border border-gray-200 rounded-xl transition-all hover:border-[rgba(212,136,58,0.3)] hover:bg-[rgba(212,136,58,0.03)]"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              <span className="text-sm font-medium" style={{ color: '#1e3a5f' }}>Google</span>
            </button>
            <button
              type="button"
              className="flex-1 flex items-center justify-center gap-2 py-3 px-4 bg-black text-white rounded-xl transition-all border border-black hover:bg-[#333] active:bg-[#555]"
              style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}
            >
              {/* Official Apple logo per HIG */}
              <svg className="w-[18px] h-[18px]" viewBox="0 0 17 20" fill="none" aria-hidden="true">
                <path
                  d="M12.82 5.58C11.81 5.58 11.02 6.07 10.47 6.07C9.88 6.07 9.17 5.61 8.31 5.61C6.54 5.61 4.71 7.01 4.71 9.93C4.71 11.73 5.39 13.62 6.23 14.85C6.95 15.9 7.57 16.74 8.45 16.74C9.28 16.74 9.63 16.19 10.64 16.19C11.67 16.19 11.91 16.72 12.82 16.72C13.74 16.72 14.37 15.82 14.99 14.87C15.46 14.15 15.66 13.45 15.67 13.42C15.64 13.41 13.76 12.65 13.76 10.5C13.76 8.63 15.25 7.79 15.33 7.73C14.38 6.33 12.94 5.58 12.82 5.58ZM12.2 3.72C12.72 3.09 13.08 2.22 13.08 1.35C13.08 1.22 13.07 1.09 13.05 1C12.21 1.03 11.21 1.56 10.61 2.27C10.11 2.84 9.68 3.72 9.68 4.6C9.68 4.74 9.7 4.88 9.71 4.93C9.78 4.94 9.89 4.96 10 4.96C10.76 4.96 11.68 4.36 12.2 3.72Z"
                  fill="white"
                />
              </svg>
              <span className="text-sm font-medium">Sign in with Apple</span>
            </button>
          </div>

          {/* Divider */}
          <div className="relative mb-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-200" />
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-4 bg-white text-gray-400">or continue with email</span>
            </div>
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
          className="hidden lg:flex lg:w-1/2 flex-col items-center justify-center p-12 xl:p-16 relative"
          style={{ backgroundColor: '#1e3a5f' }}
        >
          {/* Abstract Pipeline Visualization */}
          <div className="flex-1 flex items-center justify-center w-full">
            <div className="relative">
              {/* Circular frame */}
              <div className="w-72 h-72 xl:w-80 xl:h-80 rounded-full border-2 border-white/20 flex items-center justify-center relative">
                {/* Inner glow */}
                <div className="absolute inset-4 rounded-full bg-gradient-to-br from-white/5 to-transparent" />
                
                {/* Pipeline nodes and connections */}
                <svg className="w-56 h-56 xl:w-64 xl:h-64" viewBox="0 0 200 200" fill="none">
                  {/* Connection lines */}
                  <path d="M40 100 L80 60 L120 80 L160 40" stroke="rgba(212,136,58,0.6)" strokeWidth="2" strokeLinecap="round" />
                  <path d="M40 100 L80 120 L120 100 L160 120" stroke="rgba(255,255,255,0.3)" strokeWidth="2" strokeLinecap="round" />
                  <path d="M80 60 L80 120" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5" strokeDasharray="4 4" />
                  <path d="M120 80 L120 100" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5" strokeDasharray="4 4" />
                  
                  {/* Deal cards */}
                  <rect x="25" y="85" width="30" height="30" rx="6" fill="rgba(255,255,255,0.9)" />
                  <rect x="30" y="95" width="20" height="3" rx="1" fill="rgba(212,136,58,0.8)" />
                  <rect x="30" y="101" width="14" height="2" rx="1" fill="rgba(30,58,95,0.4)" />
                  
                  <rect x="65" y="45" width="30" height="30" rx="6" fill="rgba(212,136,58,0.9)" />
                  <rect x="70" y="55" width="20" height="3" rx="1" fill="rgba(255,255,255,0.9)" />
                  <rect x="70" y="61" width="14" height="2" rx="1" fill="rgba(255,255,255,0.5)" />
                  
                  <rect x="105" y="65" width="30" height="30" rx="6" fill="rgba(255,255,255,0.9)" />
                  <rect x="110" y="75" width="20" height="3" rx="1" fill="rgba(212,136,58,0.8)" />
                  <rect x="110" y="81" width="14" height="2" rx="1" fill="rgba(30,58,95,0.4)" />
                  
                  <rect x="145" y="25" width="30" height="30" rx="6" fill="rgba(212,136,58,0.9)" />
                  <rect x="150" y="35" width="20" height="3" rx="1" fill="rgba(255,255,255,0.9)" />
                  <rect x="150" y="41" width="14" height="2" rx="1" fill="rgba(255,255,255,0.5)" />
                  
                  {/* Bottom row */}
                  <rect x="65" y="105" width="30" height="30" rx="6" fill="rgba(255,255,255,0.7)" />
                  <rect x="70" y="115" width="20" height="3" rx="1" fill="rgba(30,58,95,0.5)" />
                  <rect x="70" y="121" width="14" height="2" rx="1" fill="rgba(30,58,95,0.3)" />
                  
                  <rect x="105" y="85" width="30" height="30" rx="6" fill="rgba(255,255,255,0.7)" />
                  <rect x="110" y="95" width="20" height="3" rx="1" fill="rgba(30,58,95,0.5)" />
                  <rect x="110" y="101" width="14" height="2" rx="1" fill="rgba(30,58,95,0.3)" />
                  
                  <rect x="145" y="105" width="30" height="30" rx="6" fill="rgba(255,255,255,0.9)" />
                  <rect x="150" y="115" width="20" height="3" rx="1" fill="rgba(212,136,58,0.8)" />
                  <rect x="150" y="121" width="14" height="2" rx="1" fill="rgba(30,58,95,0.4)" />
                  
                  {/* Sparkle accents */}
                  <circle cx="50" cy="50" r="3" fill="rgba(212,136,58,0.8)" />
                  <circle cx="170" cy="80" r="2" fill="rgba(255,255,255,0.6)" />
                  <circle cx="30" cy="140" r="2" fill="rgba(212,136,58,0.6)" />
                  <circle cx="180" cy="150" r="3" fill="rgba(255,255,255,0.4)" />
                </svg>
              </div>
              
              {/* Floating accent elements */}
              <div className="absolute -top-4 -right-4 w-8 h-8 rounded-lg rotate-12" style={{ backgroundColor: 'rgba(212,136,58,0.8)' }} />
              <div className="absolute -bottom-2 -left-6 w-6 h-6 rounded-full bg-white/20" />
            </div>
          </div>

          {/* Text content */}
          <div className="text-center mt-8">
            <h2 className="text-2xl xl:text-3xl font-semibold text-white mb-3">
              Your deals — in focus.
            </h2>
            <p className="text-white/70 text-base xl:text-lg max-w-sm">
              Everything you need in a clean, intelligent dashboard.
            </p>
          </div>

          {/* Pagination dots */}
          <div className="flex gap-2 mt-8">
            <div className="w-8 h-2 rounded-full" style={{ backgroundColor: '#D4883A' }} />
            <div className="w-2 h-2 rounded-full bg-white/30" />
            <div className="w-2 h-2 rounded-full bg-white/30" />
          </div>
        </div>
      </div>
    </div>
  );
}
