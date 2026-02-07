import { useState } from 'react';

const features = [
  {
    title: 'AI Contract Drafting',
    description: 'Instinctively assemble Dotloop-ready agreements from natural-language prompts.'
  },
  {
    title: 'Smart Field Autofill',
    description: 'Pull buyer, seller, property, and financing data directly from your CRM or files.'
  },
  {
    title: 'Amendments in Seconds',
    description: 'Request edits in plain English and regenerate updated paperwork instantly.'
  },
  {
    title: 'Compliance Checker',
    description: 'Let AI scan for missing signatures, incorrect clauses, or jurisdictional nuances.'
  },
  {
    title: 'Team Collaboration Tools',
    description: 'Shared templates, version history, and real-time updates for every stakeholder.'
  }
];

export default function ContractScribeComingSoon() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!email.trim()) {
      setStatus('error');
      return;
    }
    setStatus('loading');
    setTimeout(() => {
      setStatus('success');
      setEmail('');
    }, 1200);
  };

  return (
    <div className="min-h-screen bg-[var(--app-bg-end)] text-slate-900 flex flex-col">
      <div className="absolute inset-0 bg-gradient-to-br from-[var(--app-bg-start)] via-[var(--app-bg-mid)] to-[var(--app-bg-end)] pointer-events-none" />
      <header className="relative z-10 border-b border-slate-200/60">
        <div className="max-w-5xl mx-auto px-6 py-6 flex items-center">
          <div className="flex items-center gap-3">
            <LogoMark />
            <div>
              <p className="text-xs tracking-[0.3em] text-slate-500 uppercase font-semibold">Contract</p>
              <p className="text-xl font-semibold tracking-tight text-slate-800">Scribe</p>
            </div>
          </div>
        </div>
      </header>

      <main className="relative z-10 flex-1">
        <section className="max-w-4xl mx-auto px-6 py-16 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.4em] text-slate-500 mb-4">ContractScribe</p>
          <h1 className="text-4xl md:text-5xl font-semibold text-slate-900 leading-tight mb-4">
            ContractScribe is Coming Soon
          </h1>
          <p className="text-lg text-slate-600 mb-8 max-w-3xl mx-auto">
            The fastest way for real-estate professionals to draft, edit, and manage contracts with AI-powered precision.
            Automation that feels human, accuracy that feels inevitable.
          </p>

          <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3 justify-center max-w-2xl mx-auto">
            <input
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (status !== 'idle') setStatus('idle');
              }}
              placeholder="Enter your work email"
              className="flex-1 rounded-2xl border border-slate-200/80 bg-white/90 px-5 py-3 text-sm shadow-inner focus:outline-none focus:ring-2 focus:ring-[var(--app-accent)]/20 focus:border-[var(--app-accent)]/50"
            />
            <button
              type="submit"
              className="rounded-2xl bg-[var(--app-accent)] text-white font-semibold px-6 py-3 text-sm shadow-[0_12px_24px_rgba(var(--app-accent-rgb),0.25)] hover:bg-[var(--app-accent)] transition-colors"
              disabled={status === 'loading'}
            >
              {status === 'loading' ? 'Joining…' : status === 'success' ? 'Added!' : 'Join the Waitlist'}
            </button>
          </form>
          {status === 'success' && (
            <p className="mt-3 text-sm text-emerald-600 animate-fade-in">Thanks! We’ll be in touch shortly.</p>
          )}
          {status === 'error' && (
            <p className="mt-3 text-sm text-rose-500">Please enter a valid email address.</p>
          )}
        </section>

        <section className="max-w-6xl mx-auto px-6 pb-16">
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {features.map((feature) => (
              <div
                key={feature.title}
                className="rounded-2xl border border-slate-200/70 bg-white/80 p-6 shadow-[0_12px_30px_rgba(15,23,42,0.08)] hover:-translate-y-1 transition-transform"
              >
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[var(--app-accent)] mb-3">
                  Coming Feature
                </p>
                <h3 className="text-lg font-semibold text-slate-900 mb-2">{feature.title}</h3>
                <p className="text-sm text-slate-600">{feature.description}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="max-w-3xl mx-auto px-6 pb-20 text-center">
          <p className="text-lg text-slate-600 leading-relaxed">
            “ContractScribe empowers agents, teams, and brokerages with lightning-fast contract workflows so you can spend
            more time closing deals—not filling out paperwork.”
          </p>
        </section>
      </main>

      <footer className="relative z-10 border-t border-slate-200/70 bg-white/80 backdrop-blur">
        <div className="max-w-5xl mx-auto px-6 py-8 flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-slate-500">
          <div className="flex items-center gap-4">
            <span>© {new Date().getFullYear()} ContractScribe</span>
            <span>Terms</span>
            <span>Privacy</span>
            <span>Security</span>
          </div>
          <div className="text-xs text-slate-500">
            Made by <span className="font-semibold text-slate-700">Luminex Ventures</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

const LogoMark = () => (
  <svg width="48" height="48" viewBox="0 0 48 56" aria-hidden="true" className="drop-shadow-sm">
    <path d="M2 12L22 0L22 32L2 44Z" fill="#F3C6C5" />
    <path d="M12 18L32 6V38L12 50Z" fill="#CF7A7A" />
    <path d="M22 24L42 12V44L22 56Z" fill="#C85757" />
  </svg>
);
