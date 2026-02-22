import { Link } from 'react-router-dom';
import {
  ArrowRight,
  BarChart3,
  Bot,
  Check,
  ChevronRight,
  DollarSign,
  Gauge,
  Globe,
  Layers,
  LineChart,
  Mail,
  Map,
  Megaphone,
  Phone,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingUp,
  Users,
  Zap,
} from 'lucide-react';

const CAPABILITIES = [
  {
    icon: Layers,
    title: 'Pipeline & CRM',
    desc: 'Kanban, table view, custom stages, bulk operations, and deal import. Built for buyer, seller, renter, and landlord transactions.',
  },
  {
    icon: DollarSign,
    title: 'Commission Engine',
    desc: 'GCI tracking, brokerage splits, referral rates, transaction fees, deductions, and credits — calculated to the dollar.',
  },
  {
    icon: LineChart,
    title: 'Analytics & Forecasting',
    desc: 'Year-over-year performance, funnel conversion, goal pacing, pipeline health, and lead source ROI. Export to CSV.',
  },
  {
    icon: Megaphone,
    title: 'Marketing Intelligence',
    desc: 'Track spend by channel, measure cost per lead, attribute marketing dollars to closed deals. See what actually converts.',
  },
  {
    icon: Map,
    title: 'Market Intelligence',
    desc: 'Area market snapshots, inventory and price trends, property valuations with comps, and shareable reports.',
  },
  {
    icon: Bot,
    title: 'Luma AI Assistant',
    desc: 'Ask questions about your pipeline, performance, and tasks in plain English. Full workspace context, instant answers.',
  },
  {
    icon: Mail,
    title: 'Unified Messaging',
    desc: 'Email and SMS in one inbox. Gmail, Outlook, and Twilio built in. Conversations linked to deals automatically.',
  },
  {
    icon: Users,
    title: 'Team & Roles',
    desc: 'Multi-agent workspaces with role-based access, lead routing, agent-level filtering, and shared pipeline visibility.',
  },
];

const DIFFERENTIATORS = [
  {
    icon: Target,
    title: 'Marketing → Revenue attribution',
    desc: 'Connect every marketing dollar to the deal it generated. Know which channels close — not just which channels spend.',
  },
  {
    icon: TrendingUp,
    title: 'Pipeline health, not pipeline noise',
    desc: "Stalled deal detection, stage velocity, close rate forecasting, and GCI goal pacing. Surface what matters, hide what doesn't.",
  },
  {
    icon: DollarSign,
    title: 'Commission accuracy at any scale',
    desc: 'Splits, referrals, deductions, credits, and per-deal overrides. One system handles solo agent math and brokerage-level complexity.',
  },
  {
    icon: Globe,
    title: 'Market context built in',
    desc: 'Property valuations, area comps, inventory trends, and days-on-market — without leaving the platform or paying for a separate data feed.',
  },
];

const FAQ = [
  {
    q: 'Who is Luma-IQ built for?',
    a: 'Independent real estate agents and teams of 1–50+. The same platform scales from a solo agent tracking deals to a brokerage managing pipelines, marketing, and team performance.',
  },
  {
    q: 'How is this different from a generic CRM?',
    a: "Generic CRMs don't understand commissions, pipeline stages for real estate, marketing attribution to closed deals, or market data. Luma-IQ was built for this industry from day one.",
  },
  {
    q: 'How long does setup take?',
    a: 'Minutes. Create a workspace, add your deals or import via CSV, and you’re running. No implementation project, no consultant, no certification.',
  },
  {
    q: 'What integrations are available?',
    a: 'Gmail, Outlook, Twilio SMS, Google Ads, Meta Ads, Zillow, Realtor.com, Follow Up Boss, Dotloop, DocuSign, and Zapier. More added regularly.',
  },
  {
    q: 'Can I change plans or cancel anytime?',
    a: 'Yes. Upgrade, downgrade, or cancel at any time. Your data stays with your workspace.',
  },
];

function SoftCard({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={[
        'rounded-2xl border border-black/5 bg-white/80 shadow-[0_1px_0_rgba(15,23,42,0.06),0_8px_24px_rgba(15,23,42,0.06)] backdrop-blur',
        className,
      ].join(' ')}
    >
      {children}
    </div>
  );
}

export default function Landing() {
  return (
    <div className="min-h-screen bg-[#f6f7fb] text-slate-900 antialiased">
      {/* subtle page texture */}
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute -top-40 left-1/2 h-[720px] w-[720px] -translate-x-1/2 rounded-full bg-[#1e3a5f]/10 blur-[120px]" />
        <div className="absolute top-[35%] right-[-180px] h-[520px] w-[520px] rounded-full bg-[#D4883A]/10 blur-[120px]" />
        <div className="absolute bottom-[-220px] left-[-180px] h-[520px] w-[520px] rounded-full bg-indigo-500/10 blur-[130px]" />
      </div>

      {/* ── HEADER (light glass) ── */}
      <header className="sticky top-0 z-40 border-b border-black/5 bg-[#f6f7fb]/70 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <Link to="/" className="flex items-center gap-2">
            <img src="/LumaIQ.png" alt="Luma-IQ" className="h-8" />
          </Link>

          <nav className="hidden items-center gap-8 md:flex">
            <a href="#platform" className="text-sm font-medium text-slate-600 transition hover:text-slate-900">
              Platform
            </a>
            <Link to="/pricing" className="text-sm font-medium text-slate-600 transition hover:text-slate-900">
              Pricing
            </Link>
            <Link to="/contact-sales" className="text-sm font-medium text-slate-600 transition hover:text-slate-900">
              Contact
            </Link>
            <Link to="/login" className="text-sm font-medium text-slate-600 transition hover:text-slate-900">
              Log in
            </Link>

            <Link
              to="/pricing"
              className="inline-flex items-center gap-2 rounded-full bg-[#1e3a5f] px-5 py-2.5 text-sm font-semibold text-white shadow-sm shadow-[#1e3a5f]/20 transition hover:opacity-95"
            >
              Get started <ArrowRight className="h-4 w-4" />
            </Link>
          </nav>

          <div className="flex items-center gap-3 md:hidden">
            <Link to="/login" className="text-sm font-medium text-slate-600">
              Log in
            </Link>
            <Link
              to="/pricing"
              className="inline-flex items-center gap-1.5 rounded-full bg-[#1e3a5f] px-4 py-2 text-sm font-semibold text-white"
            >
              Plans
            </Link>
          </div>
        </div>
      </header>

      <main>
        {/* ── HERO (soft light) ── */}
        <section className="relative">
          <div className="mx-auto max-w-7xl px-6 pb-14 pt-16 md:pb-20 md:pt-20">
            <div className="mx-auto max-w-3xl text-center">
              <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-black/5 bg-white/70 px-4 py-1.5 text-sm font-medium text-slate-700">
                <Sparkles className="h-4 w-4 text-[#D4883A]" />
                The real estate operating system
              </div>

              <h1 className="text-4xl font-bold leading-[1.08] tracking-tight text-slate-900 md:text-6xl">
                Your deals.{' '}
                <span className="bg-gradient-to-r from-[#1e3a5f] via-[#1e3a5f] to-[#D4883A] bg-clip-text text-transparent">
                  In focus.
                </span>
              </h1>

              <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-slate-600 md:text-xl">
                Pipeline, commissions, marketing ROI, market data, and AI — unified in one platform built exclusively for real estate professionals.
              </p>

              <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
                <Link
                  to="/pricing"
                  className="inline-flex items-center gap-2 rounded-full bg-[#1e3a5f] px-8 py-4 text-base font-semibold text-white shadow-sm shadow-[#1e3a5f]/25 transition hover:opacity-95"
                >
                  View plans <ArrowRight className="h-5 w-5" />
                </Link>
                <Link
                  to="/contact-sales"
                  className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white/60 px-8 py-4 text-base font-semibold text-slate-700 transition hover:bg-white hover:text-slate-900"
                >
                  Talk to sales <ChevronRight className="h-5 w-5" />
                </Link>
              </div>

              <div className="mt-8 flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-sm text-slate-500">
                <span className="inline-flex items-center gap-2">
                  <Check className="h-4 w-4 text-[#D4883A]" /> Live in minutes
                </span>
                <span className="inline-flex items-center gap-2">
                  <Check className="h-4 w-4 text-[#D4883A]" /> No implementation required
                </span>
                <span className="inline-flex items-center gap-2">
                  <Check className="h-4 w-4 text-[#D4883A]" /> Cancel anytime
                </span>
              </div>
            </div>

            {/* Product Preview (light card) */}
            <div className="mx-auto mt-14 max-w-5xl">
              <SoftCard className="p-2">
                <div className="rounded-xl bg-gradient-to-b from-white to-[#f7f8fc] p-6 md:p-8">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="h-3 w-3 rounded-full bg-rose-400/80" />
                      <div className="h-3 w-3 rounded-full bg-amber-400/80" />
                      <div className="h-3 w-3 rounded-full bg-emerald-400/80" />
                    </div>
                    <div className="inline-flex items-center gap-2 rounded-full border border-black/5 bg-white px-3 py-1 text-xs font-semibold text-slate-700">
                      <Gauge className="h-3.5 w-3.5 text-[#1e3a5f]" /> Live dashboard
                    </div>
                  </div>

                  <div className="mt-6 grid gap-3 sm:grid-cols-4">
                    {[
                      { label: 'Active deals', value: '24', change: '+3' },
                      { label: 'Pipeline value', value: '$1.8M', change: '+12%' },
                      { label: 'Close rate', value: '28%', change: '+4%' },
                      { label: 'YTD GCI', value: '$142K', change: '+18%' },
                    ].map((s) => (
                      <div
                        key={s.label}
                        className="rounded-xl border border-black/5 bg-white p-4 shadow-[0_1px_0_rgba(15,23,42,0.05)]"
                      >
                        <div className="text-xs font-medium text-slate-500">{s.label}</div>
                        <div className="mt-1.5 flex items-baseline gap-2">
                          <span className="text-2xl font-bold text-slate-900">{s.value}</span>
                          <span className="text-xs font-semibold text-emerald-600">{s.change}</span>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="mt-4 grid gap-3 md:grid-cols-[1fr_280px]">
                    <div className="rounded-xl border border-black/5 bg-white p-5">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold text-slate-900">Pipeline stages</span>
                        <span className="text-xs text-slate-500">This quarter</span>
                      </div>
                      <div className="mt-5 space-y-3">
                        {[
                          { name: 'New leads', pct: 32, count: 14 },
                          { name: 'Contacted', pct: 26, count: 11 },
                          { name: 'Showing', pct: 22, count: 9 },
                          { name: 'Under contract', pct: 20, count: 8 },
                        ].map((row) => (
                          <div key={row.name}>
                            <div className="flex items-center justify-between text-xs">
                              <span className="font-medium text-slate-600">{row.name}</span>
                              <span className="text-slate-500">{row.count} deals</span>
                            </div>
                            <div className="mt-1.5 h-1.5 w-full rounded-full bg-slate-100">
                              <div
                                className="h-1.5 rounded-full bg-gradient-to-r from-[#1e3a5f] to-[#D4883A]"
                                style={{ width: `${row.pct}%` }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-3">
                      {[
                        {
                          icon: Sparkles,
                          tone: 'text-[#D4883A]',
                          bg: 'bg-[#D4883A]/10',
                          title: 'Luma AI Insight',
                          body: '3 deals stalled 14+ days. Follow up to recover $240K pipeline value.',
                        },
                        {
                          icon: DollarSign,
                          tone: 'text-emerald-700',
                          bg: 'bg-emerald-500/10',
                          title: 'Commission forecast',
                          body: '$38K projected GCI from 4 deals closing this month.',
                        },
                        {
                          icon: Megaphone,
                          tone: 'text-sky-800',
                          bg: 'bg-sky-500/10',
                          title: 'Marketing ROI',
                          body: 'Google Ads: $2.4K spend → 6 closed deals. Best performing channel.',
                        },
                      ].map((c) => (
                        <div key={c.title} className="rounded-xl border border-black/5 bg-white p-4">
                          <div className="flex items-center gap-3">
                            <div className={`inline-flex h-9 w-9 items-center justify-center rounded-lg ${c.bg} ${c.tone}`}>
                              <c.icon className="h-4 w-4" />
                            </div>
                            <div>
                              <div className="text-xs font-semibold text-slate-900">{c.title}</div>
                              <div className="mt-0.5 text-xs leading-snug text-slate-600">{c.body}</div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </SoftCard>
            </div>
          </div>
        </section>

        {/* ── PLATFORM CAPABILITIES (soft, not white) ── */}
        <section id="platform" className="border-t border-black/5 bg-[#f1f3f8] py-18 md:py-24">
          <div className="mx-auto max-w-7xl px-6 py-20 md:py-24">
            <div className="mx-auto max-w-2xl text-center">
              <p className="text-sm font-semibold uppercase tracking-widest text-[#D4883A]">Platform</p>
              <h2 className="mt-3 text-3xl font-bold tracking-tight text-slate-900 md:text-4xl lg:text-5xl">
                Everything you need to close more and keep more
              </h2>
              <p className="mt-5 text-lg leading-relaxed text-slate-600">
                Pipeline management, commission tracking, marketing attribution, market data, AI insights, and team controls — in a single workspace.
              </p>
            </div>

            <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {CAPABILITIES.map((cap) => (
                <SoftCard
                  key={cap.title}
                  className="group p-6 transition hover:shadow-[0_1px_0_rgba(15,23,42,0.06),0_16px_40px_rgba(15,23,42,0.10)]"
                >
                  <div className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-[#1e3a5f]/10 text-[#1e3a5f] transition group-hover:bg-[#1e3a5f] group-hover:text-white">
                    <cap.icon className="h-5 w-5" />
                  </div>
                  <h3 className="mt-4 text-base font-semibold text-slate-900">{cap.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-600">{cap.desc}</p>
                </SoftCard>
              ))}
            </div>
          </div>
        </section>

        {/* ── WHY LUMA-IQ (light, with inset card) ── */}
        <section className="border-t border-black/5 bg-[#f6f7fb] py-20 md:py-24">
          <div className="mx-auto max-w-7xl px-6">
            <div className="grid gap-14 lg:grid-cols-2 lg:items-center">
              <div>
                <p className="text-sm font-semibold uppercase tracking-widest text-[#D4883A]">Why Luma-IQ</p>
                <h2 className="mt-3 text-3xl font-bold tracking-tight text-slate-900 md:text-4xl">
                  Not another generic CRM with a real estate skin
                </h2>
                <p className="mt-5 text-lg leading-relaxed text-slate-600">
                  Most tools bolt on real estate features as an afterthought. Luma-IQ was designed from the ground up for how agents and teams actually work — commissions, attribution, market context, and all.
                </p>

                <div className="mt-10 space-y-6">
                  {DIFFERENTIATORS.map((d) => (
                    <div key={d.title} className="flex gap-4">
                      <div className="mt-1 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#1e3a5f]/10 text-[#1e3a5f]">
                        <d.icon className="h-5 w-5" />
                      </div>
                      <div>
                        <h3 className="text-base font-semibold text-slate-900">{d.title}</h3>
                        <p className="mt-1 text-sm leading-relaxed text-slate-600">{d.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Right: inset (still light, not full dark) */}
              <SoftCard className="p-7 md:p-8">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-slate-900">Lead source performance</span>
                  <span className="text-xs text-slate-500">Last 90 days</span>
                </div>

                <div className="mt-6 space-y-3">
                  {[
                    { source: 'Google Ads', leads: 48, closed: 6, spend: '$2.4K', gci: '$42K', dot: 'bg-[#D4883A]' },
                    { source: 'Zillow', leads: 32, closed: 3, spend: '$1.8K', gci: '$28K', dot: 'bg-[#1e3a5f]' },
                    { source: 'Referrals', leads: 18, closed: 5, spend: '$0', gci: '$61K', dot: 'bg-emerald-500' },
                    { source: 'Meta Ads', leads: 26, closed: 2, spend: '$1.2K', gci: '$16K', dot: 'bg-amber-500' },
                  ].map((row) => (
                    <div key={row.source} className="rounded-xl border border-black/5 bg-white p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className={`h-2.5 w-2.5 rounded-full ${row.dot}`} />
                          <span className="text-sm font-semibold text-slate-900">{row.source}</span>
                        </div>
                        <span className="text-xs font-semibold text-emerald-700">{row.gci} GCI</span>
                      </div>
                      <div className="mt-2 flex gap-4 text-xs text-slate-500">
                        <span>{row.leads} leads</span>
                        <span>{row.closed} closed</span>
                        <span>{row.spend} spent</span>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-5 rounded-xl border border-[#D4883A]/20 bg-[#D4883A]/10 p-4">
                  <div className="flex items-start gap-3">
                    <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-[#D4883A]" />
                    <span className="text-sm font-medium text-slate-700">
                      Referrals generated the highest GCI per dollar. Consider increasing referral incentives.
                    </span>
                  </div>
                </div>
              </SoftCard>
            </div>
          </div>
        </section>

        {/* ── INTEGRATIONS (soft gray) ── */}
        <section className="border-t border-black/5 bg-[#f1f3f8] py-20 md:py-24">
          <div className="mx-auto max-w-7xl px-6">
            <div className="mx-auto max-w-2xl text-center">
              <p className="text-sm font-semibold uppercase tracking-widest text-[#D4883A]">Integrations</p>
              <h2 className="mt-3 text-3xl font-bold tracking-tight text-slate-900 md:text-4xl">
                Connects to the tools you already use
              </h2>
              <p className="mt-5 text-lg leading-relaxed text-slate-600">
                No rip-and-replace. Plug in your email, marketing channels, and transaction tools — and start working.
              </p>
            </div>

            <div className="mx-auto mt-12 grid max-w-4xl gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {[
                { name: 'Gmail & Google Workspace', icon: Mail, desc: 'Email sync and logging' },
                { name: 'Microsoft Outlook', icon: Mail, desc: 'Email sync and logging' },
                { name: 'Twilio SMS', icon: Phone, desc: 'Text messaging integration' },
                { name: 'Google Ads', icon: Megaphone, desc: 'Campaign spend and leads' },
                { name: 'Meta Ads', icon: Megaphone, desc: 'Facebook and Instagram ads' },
                { name: 'Zillow & Realtor.com', icon: Globe, desc: 'Portal lead attribution' },
                { name: 'Follow Up Boss', icon: Users, desc: 'CRM data sync' },
                { name: 'Dotloop & DocuSign', icon: ShieldCheck, desc: 'Transaction management' },
                { name: 'Zapier', icon: Zap, desc: '5,000+ app connections' },
              ].map((int) => (
                <div
                  key={int.name}
                  className="flex items-center gap-3 rounded-xl border border-black/5 bg-white/80 p-4 shadow-[0_1px_0_rgba(15,23,42,0.05)] transition hover:bg-white"
                >
                  <div className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#1e3a5f]/10 text-[#1e3a5f]">
                    <int.icon className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-slate-900">{int.name}</div>
                    <div className="text-xs text-slate-500">{int.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── HOW IT WORKS (light) ── */}
        <section className="border-t border-black/5 bg-[#f6f7fb] py-20 md:py-24">
          <div className="mx-auto max-w-7xl px-6">
            <div className="mx-auto max-w-2xl text-center">
              <p className="text-sm font-semibold uppercase tracking-widest text-[#D4883A]">Get started</p>
              <h2 className="mt-3 text-3xl font-bold tracking-tight text-slate-900 md:text-4xl">
                Live in minutes — not months
              </h2>
              <p className="mt-5 text-lg leading-relaxed text-slate-600">
                No implementation project. No consultant. No IT department.
              </p>
            </div>

            <div className="mx-auto mt-14 grid max-w-4xl gap-6 lg:grid-cols-3">
              {[
                {
                  step: '01',
                  title: 'Create your workspace',
                  desc: 'Pick a plan, name your workspace, and set your preferences. Independent or team — same path.',
                  icon: Sparkles,
                },
                {
                  step: '02',
                  title: 'Add deals and connect tools',
                  desc: 'Import your pipeline via CSV or start fresh. Connect email, marketing channels, and transaction tools.',
                  icon: Layers,
                },
                {
                  step: '03',
                  title: "See what's making money",
                  desc: 'Pipeline health, commission forecasts, marketing ROI, and AI-powered insights — all in one view.',
                  icon: BarChart3,
                },
              ].map((s) => (
                <SoftCard key={s.step} className="relative p-8">
                  <div className="text-4xl font-bold text-[#1e3a5f]/10">{s.step}</div>
                  <div className="mt-4 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-[#1e3a5f]/10 text-[#1e3a5f]">
                    <s.icon className="h-5 w-5" />
                  </div>
                  <h3 className="mt-4 text-lg font-semibold text-slate-900">{s.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-600">{s.desc}</p>
                </SoftCard>
              ))}
            </div>
          </div>
        </section>

        {/* ── FAQ (soft gray) ── */}
        <section className="border-t border-black/5 bg-[#f1f3f8] py-20 md:py-24">
          <div className="mx-auto max-w-7xl px-6">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="text-3xl font-bold tracking-tight text-slate-900 md:text-4xl">
                Frequently asked questions
              </h2>
            </div>

            <div className="mx-auto mt-12 max-w-3xl divide-y divide-black/5 rounded-2xl border border-black/5 bg-white/80 px-6 shadow-[0_1px_0_rgba(15,23,42,0.05)]">
              {FAQ.map((f) => (
                <details key={f.q} className="group py-6 [&_summary::-webkit-details-marker]:hidden">
                  <summary className="flex cursor-pointer items-center justify-between gap-6">
                    <span className="text-base font-semibold text-slate-900 transition group-hover:text-[#1e3a5f]">
                      {f.q}
                    </span>
                    <ChevronRight className="h-5 w-5 shrink-0 text-slate-400 transition group-open:rotate-90" />
                  </summary>
                  <p className="mt-3 pr-10 text-sm leading-relaxed text-slate-600">{f.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* ── CTA (only dark section, but softened) ── */}
        <section className="border-t border-black/5 bg-[#101b2b] py-18 md:py-22">
          <div className="mx-auto max-w-7xl px-6 py-20 text-center">
            <h2 className="text-3xl font-bold tracking-tight text-white md:text-4xl lg:text-5xl">
              Your pipeline deserves better than a spreadsheet
            </h2>
            <p className="mx-auto mt-5 max-w-xl text-lg leading-relaxed text-slate-300">
              See your deals, commissions, marketing ROI, and market context — in one place. Get started in minutes.
            </p>
            <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Link
                to="/pricing"
                className="inline-flex items-center gap-2 rounded-full bg-white px-8 py-4 text-base font-semibold text-[#101b2b] shadow-sm transition hover:opacity-95"
              >
                View plans <ArrowRight className="h-5 w-5" />
              </Link>
              <Link
                to="/contact-sales"
                className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/5 px-8 py-4 text-base font-semibold text-white transition hover:bg-white/10"
              >
                Talk to sales
              </Link>
            </div>
          </div>
        </section>
      </main>

      {/* ── FOOTER (soft) ── */}
      <footer className="border-t border-black/5 bg-[#f6f7fb] py-12">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-6 px-6 sm:flex-row">
          <Link to="/" className="flex items-center gap-2">
            <img src="/LumaIQ.png" alt="Luma-IQ" className="h-6" />
          </Link>

          <nav className="flex flex-wrap items-center justify-center gap-8 text-sm text-slate-600">
            <Link to="/pricing" className="transition hover:text-slate-900">Pricing</Link>
            <Link to="/contact-sales" className="transition hover:text-slate-900">Contact</Link>
            <Link to="/legal/terms" className="transition hover:text-slate-900">Terms</Link>
            <Link to="/legal/privacy" className="transition hover:text-slate-900">Privacy</Link>
          </nav>

          <div className="text-xs text-slate-500">
            &copy; {new Date().getFullYear()} Luma-IQ. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}