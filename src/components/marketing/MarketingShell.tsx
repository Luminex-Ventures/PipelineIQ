import { useState, useEffect, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ArrowRight, Menu, X } from 'lucide-react';

const NAV_LINKS = [
  { to: '/#platform', label: 'Platform', isAnchor: true },
  { to: '/pricing', label: 'Pricing', isAnchor: false },
  { to: '/contact-sales', label: 'Contact', isAnchor: false },
];

export default function MarketingShell({ children }: { children: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileOpen]);

  return (
    <div className="min-h-screen bg-[#fafbfe] text-slate-900 antialiased selection:bg-[#D4883A]/20">
      {/* ambient background */}
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="animate-float absolute -top-32 left-1/2 h-[700px] w-[700px] -translate-x-1/2 rounded-full bg-[#1e3a5f]/[0.07] blur-[140px]" />
        <div className="animate-float-slow absolute top-[40%] -right-40 h-[500px] w-[500px] rounded-full bg-[#D4883A]/[0.06] blur-[140px]" />
        <div className="animate-float absolute -bottom-48 -left-40 h-[500px] w-[500px] rounded-full bg-indigo-500/[0.05] blur-[140px]" />
      </div>

      {/* header */}
      <header className="sticky top-0 z-50 border-b border-slate-200/50 bg-[#fafbfe]/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <Link to="/" className="flex shrink-0 items-center gap-2">
            <img src="/LumaIQ.png" alt="Luma-IQ" className="h-8" />
          </Link>

          {/* desktop nav */}
          <nav className="hidden items-center gap-10 md:flex">
            {NAV_LINKS.map((l) =>
              l.isAnchor ? (
                <a
                  key={l.to}
                  href={l.to}
                  className="text-[15px] font-medium text-slate-500 transition-colors hover:text-slate-900"
                >
                  {l.label}
                </a>
              ) : (
                <Link
                  key={l.to}
                  to={l.to}
                  className={`text-[15px] font-medium transition-colors hover:text-slate-900 ${
                    location.pathname === l.to ? 'text-slate-900' : 'text-slate-500'
                  }`}
                >
                  {l.label}
                </Link>
              ),
            )}

            <Link
              to="/login"
              className="text-[15px] font-medium text-slate-500 transition-colors hover:text-slate-900"
            >
              Log in
            </Link>

            <Link
              to="/pricing"
              className="inline-flex items-center gap-2 rounded-full bg-[#1e3a5f] px-6 py-2.5 text-sm font-semibold text-white shadow-md shadow-[#1e3a5f]/15 transition-all hover:shadow-lg hover:shadow-[#1e3a5f]/20 hover:brightness-110"
            >
              Get started <ArrowRight className="h-4 w-4" />
            </Link>
          </nav>

          {/* mobile toggle */}
          <div className="flex items-center gap-3 md:hidden">
            <Link to="/login" className="text-sm font-medium text-slate-500">
              Log in
            </Link>
            <button
              onClick={() => setMobileOpen(!mobileOpen)}
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-slate-700 transition hover:bg-slate-100"
              aria-label="Toggle menu"
            >
              {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {/* mobile menu */}
        <div
          className={`overflow-hidden transition-all duration-300 ease-in-out md:hidden ${
            mobileOpen ? 'max-h-80 border-t border-slate-200/50' : 'max-h-0'
          }`}
        >
          <nav className="flex flex-col gap-1 px-6 py-4">
            {NAV_LINKS.map((l) =>
              l.isAnchor ? (
                <a
                  key={l.to}
                  href={l.to}
                  className="rounded-lg px-3 py-2.5 text-[15px] font-medium text-slate-600 transition hover:bg-slate-100"
                >
                  {l.label}
                </a>
              ) : (
                <Link
                  key={l.to}
                  to={l.to}
                  className="rounded-lg px-3 py-2.5 text-[15px] font-medium text-slate-600 transition hover:bg-slate-100"
                >
                  {l.label}
                </Link>
              ),
            )}
            <Link
              to="/pricing"
              className="mt-2 inline-flex items-center justify-center gap-2 rounded-full bg-[#1e3a5f] px-6 py-3 text-sm font-semibold text-white"
            >
              Get started <ArrowRight className="h-4 w-4" />
            </Link>
          </nav>
        </div>
      </header>

      {/* page content */}
      <main className="relative">{children}</main>

      {/* footer */}
      <footer className="border-t border-slate-200/50 bg-[#fafbfe]">
        <div className="mx-auto max-w-7xl px-6 py-16">
          <div className="grid gap-12 sm:grid-cols-2 lg:grid-cols-[1.5fr_1fr_1fr_1fr]">
            <div>
              <Link to="/" className="inline-flex items-center gap-2">
                <img src="/LumaIQ.png" alt="Luma-IQ" className="h-7" />
              </Link>
              <p className="mt-4 max-w-xs text-sm leading-relaxed text-slate-400">
                The operating system for real estate professionals. Pipeline,
                commissions, marketing, market data, and AI — in one place.
              </p>
            </div>

            <div>
              <h4 className="text-xs font-bold uppercase tracking-[0.15em] text-slate-900">
                Product
              </h4>
              <ul className="mt-4 space-y-3">
                {['Pipeline & CRM', 'Analytics', 'Marketing Intelligence', 'Market Data', 'AI Assistant'].map(
                  (item) => (
                    <li key={item}>
                      <a
                        href="/#platform"
                        className="text-sm text-slate-400 transition-colors hover:text-slate-700"
                      >
                        {item}
                      </a>
                    </li>
                  ),
                )}
              </ul>
            </div>

            <div>
              <h4 className="text-xs font-bold uppercase tracking-[0.15em] text-slate-900">
                Company
              </h4>
              <ul className="mt-4 space-y-3">
                <li>
                  <Link
                    to="/pricing"
                    className="text-sm text-slate-400 transition-colors hover:text-slate-700"
                  >
                    Pricing
                  </Link>
                </li>
                <li>
                  <Link
                    to="/contact-sales"
                    className="text-sm text-slate-400 transition-colors hover:text-slate-700"
                  >
                    Contact sales
                  </Link>
                </li>
              </ul>
            </div>

            <div>
              <h4 className="text-xs font-bold uppercase tracking-[0.15em] text-slate-900">
                Legal
              </h4>
              <ul className="mt-4 space-y-3">
                <li>
                  <Link
                    to="/legal/terms"
                    className="text-sm text-slate-400 transition-colors hover:text-slate-700"
                  >
                    Terms of service
                  </Link>
                </li>
                <li>
                  <Link
                    to="/legal/privacy"
                    className="text-sm text-slate-400 transition-colors hover:text-slate-700"
                  >
                    Privacy policy
                  </Link>
                </li>
              </ul>
            </div>
          </div>

          <div className="mt-14 flex flex-col items-center justify-between gap-4 border-t border-slate-100 pt-8 sm:flex-row">
            <span className="text-xs text-slate-400">
              &copy; {new Date().getFullYear()} Luma-IQ. All rights reserved.
            </span>
            <div className="flex items-center gap-6">
              <Link
                to="/legal/terms"
                className="text-xs text-slate-400 transition-colors hover:text-slate-600"
              >
                Terms
              </Link>
              <Link
                to="/legal/privacy"
                className="text-xs text-slate-400 transition-colors hover:text-slate-600"
              >
                Privacy
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
