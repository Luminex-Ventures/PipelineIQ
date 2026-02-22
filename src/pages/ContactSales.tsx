import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Building2, Mail, MessageSquare, Sparkles, Users } from 'lucide-react';
import { supabase } from '../lib/supabase';
import MarketingShell from '../components/marketing/MarketingShell';

export default function ContactSales() {
  const [searchParams] = useSearchParams();
  const planParam = searchParams.get('plan') ?? 'enterprise';

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [company, setCompany] = useState('');
  const [teamSize, setTeamSize] = useState('');
  const [notes, setNotes] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const { error: insertErr } = await supabase.from('enterprise_leads').insert({
      plan_code: planParam,
      name,
      email,
      company: company || null,
      team_size: teamSize || null,
      notes: notes || null,
    });

    if (insertErr) {
      setError(insertErr.message);
      setLoading(false);
      return;
    }

    setSent(true);
    setLoading(false);
  };

  if (sent) {
    return (
      <MarketingShell>
        <section className="flex min-h-[60vh] items-center justify-center px-6 py-24">
          <div className="w-full max-w-md rounded-2xl border border-white/60 bg-white/80 p-10 text-center shadow-[0_1px_3px_rgba(15,23,42,0.04),0_8px_28px_rgba(15,23,42,0.06)] backdrop-blur-sm">
            <div className="mx-auto mb-4 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-600">
              <Mail className="h-6 w-6" />
            </div>
            <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">
              Thank you
            </h1>
            <p className="mt-3 text-[15px] leading-relaxed text-slate-500">
              We've received your request and will be in touch within one
              business day.
            </p>
            <Link
              to="/pricing"
              className="mt-8 inline-flex items-center gap-2 rounded-full bg-[#1e3a5f] px-7 py-3 text-sm font-semibold text-white shadow-md shadow-[#1e3a5f]/15 transition-all hover:brightness-110"
            >
              Back to pricing
            </Link>
          </div>
        </section>
      </MarketingShell>
    );
  }

  return (
    <MarketingShell>
      <section className="py-20 md:py-28">
        <div className="mx-auto max-w-7xl px-6">
          <div className="grid items-start gap-16 lg:grid-cols-[1fr_1.1fr]">
            {/* left column — copy */}
            <div className="lg:sticky lg:top-28">
              <div className="mb-6 inline-flex items-center gap-2.5 rounded-full border border-[#D4883A]/20 bg-[#D4883A]/[0.06] px-5 py-2 text-sm font-semibold text-[#b87430]">
                <Sparkles className="h-4 w-4" />
                Let's talk
              </div>
              <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 md:text-4xl lg:text-5xl">
                Get in touch with our team
              </h1>
              <p className="mt-5 max-w-lg text-lg leading-relaxed text-slate-500">
                Whether you need a custom plan, want a guided demo, or have
                questions about how Luma-IQ fits your brokerage — we're here
                to help.
              </p>

              <div className="mt-10 space-y-5">
                {[
                  {
                    icon: Users,
                    title: 'Custom team setup',
                    desc: 'Role-based access, lead routing, and brokerage-level configuration.',
                  },
                  {
                    icon: Building2,
                    title: 'Enterprise pricing',
                    desc: 'Volume discounts and flexible billing for teams of 10+.',
                  },
                  {
                    icon: MessageSquare,
                    title: 'Guided onboarding',
                    desc: 'We walk your team through setup, imports, and integrations.',
                  },
                ].map((item) => (
                  <div key={item.title} className="flex gap-4">
                    <div className="mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#1e3a5f]/[0.08] text-[#1e3a5f]">
                      <item.icon className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-slate-900">{item.title}</h3>
                      <p className="mt-1 text-sm leading-relaxed text-slate-500">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* right column — form */}
            <div className="rounded-2xl border border-white/60 bg-white/80 p-8 shadow-[0_1px_3px_rgba(15,23,42,0.04),0_8px_28px_rgba(15,23,42,0.06)] backdrop-blur-sm md:p-10">
              <h2 className="text-xl font-bold text-slate-900">Contact sales</h2>
              <p className="mt-2 text-sm text-slate-500">
                Tell us about your team and we'll get back to you within one
                business day.
              </p>

              <form onSubmit={handleSubmit} className="mt-8 space-y-5">
                <div>
                  <label className="mb-1.5 block text-sm font-semibold text-slate-700">
                    Name
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-[15px] text-slate-900 placeholder:text-slate-400 transition focus:border-[#D4883A] focus:outline-none focus:ring-2 focus:ring-[#D4883A]/20"
                    required
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-semibold text-slate-700">
                    Work email
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-[15px] text-slate-900 placeholder:text-slate-400 transition focus:border-[#D4883A] focus:outline-none focus:ring-2 focus:ring-[#D4883A]/20"
                    required
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-semibold text-slate-700">
                    Company
                  </label>
                  <input
                    type="text"
                    value={company}
                    onChange={(e) => setCompany(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-[15px] text-slate-900 placeholder:text-slate-400 transition focus:border-[#D4883A] focus:outline-none focus:ring-2 focus:ring-[#D4883A]/20"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-semibold text-slate-700">
                    Team size
                  </label>
                  <input
                    type="text"
                    value={teamSize}
                    onChange={(e) => setTeamSize(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-[15px] text-slate-900 placeholder:text-slate-400 transition focus:border-[#D4883A] focus:outline-none focus:ring-2 focus:ring-[#D4883A]/20"
                    placeholder="e.g. 25"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-semibold text-slate-700">
                    Notes
                  </label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-[15px] text-slate-900 placeholder:text-slate-400 transition focus:border-[#D4883A] focus:outline-none focus:ring-2 focus:ring-[#D4883A]/20"
                    rows={3}
                    placeholder="Tell us about your needs..."
                  />
                </div>

                {error && (
                  <p className="rounded-lg bg-red-50 px-4 py-2.5 text-sm font-medium text-red-700">
                    {error}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="flex w-full items-center justify-center gap-2 rounded-full bg-[#1e3a5f] py-3.5 text-sm font-semibold text-white shadow-md shadow-[#1e3a5f]/15 transition-all hover:brightness-110 disabled:opacity-50"
                >
                  {loading ? 'Sending...' : 'Submit'}
                </button>
              </form>
            </div>
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}
