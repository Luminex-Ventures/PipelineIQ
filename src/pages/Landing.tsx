import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  ArrowUpRight,
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
import MarketingShell from '../components/marketing/MarketingShell';

/* ═══════════════════════════════════════════════
   Data
   ═══════════════════════════════════════════════ */

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
    desc: 'Year-over-year performance, funnel conversion, goal pacing, pipeline health, and lead source ROI.',
  },
  {
    icon: Megaphone,
    title: 'Marketing Intelligence',
    desc: 'Track spend by channel, measure cost per lead, attribute marketing dollars to closed deals.',
  },
  {
    icon: Map,
    title: 'Market Intelligence',
    desc: 'Area market snapshots, inventory and price trends, property valuations with comps, and shareable reports.',
  },
  {
    icon: Bot,
    title: 'Luma AI Assistant',
    desc: 'Ask questions about your pipeline, performance, and tasks in plain English. Full workspace context.',
  },
  {
    icon: Mail,
    title: 'Unified Messaging',
    desc: 'Email and SMS in one inbox. Gmail, Outlook, and Twilio built in. Conversations linked to deals.',
  },
  {
    icon: Users,
    title: 'Team & Roles',
    desc: 'Multi-agent workspaces with role-based access, lead routing, agent-level filtering, and shared visibility.',
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
    desc: 'Property valuations, area comps, inventory trends, and days-on-market — without leaving the platform.',
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
    a: "Minutes. Create a workspace, add your deals or import via CSV, and you're running. No implementation project, no consultant, no certification.",
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

const INTEGRATIONS = [
  { name: 'Gmail & Google Workspace', icon: Mail, desc: 'Email sync and logging' },
  { name: 'Microsoft Outlook', icon: Mail, desc: 'Email sync and logging' },
  { name: 'Twilio SMS', icon: Phone, desc: 'Text messaging' },
  { name: 'Google Ads', icon: Megaphone, desc: 'Campaign spend & leads' },
  { name: 'Meta Ads', icon: Megaphone, desc: 'Facebook & Instagram ads' },
  { name: 'Zillow & Realtor.com', icon: Globe, desc: 'Portal lead attribution' },
  { name: 'Follow Up Boss', icon: Users, desc: 'CRM data sync' },
  { name: 'Dotloop & DocuSign', icon: ShieldCheck, desc: 'Transaction management' },
  { name: 'Zapier', icon: Zap, desc: '5,000+ app connections' },
];

const STEPS = [
  {
    num: '01',
    title: 'Create your workspace',
    desc: 'Pick a plan, name your workspace, and set your preferences. Independent or team — same path.',
    icon: Sparkles,
  },
  {
    num: '02',
    title: 'Add deals & connect tools',
    desc: 'Import your pipeline via CSV or start fresh. Connect email, marketing channels, and transaction tools.',
    icon: Layers,
  },
  {
    num: '03',
    title: "See what's making money",
    desc: 'Pipeline health, commission forecasts, marketing ROI, and AI-powered insights — all in one view.',
    icon: BarChart3,
  },
];

/* ═══════════════════════════════════════════════
   Scroll-reveal primitives
   ═══════════════════════════════════════════════ */

function useInView<T extends HTMLElement>(threshold = 0.12) {
  const ref = useRef<T>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setVisible(true);
          obs.disconnect();
        }
      },
      { threshold, rootMargin: '0px 0px -40px 0px' },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);

  return { ref, visible };
}

function Reveal({
  children,
  delay = 0,
  className = '',
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  const { ref, visible } = useInView<HTMLDivElement>();
  return (
    <div
      ref={ref}
      className={`transition-all duration-700 ease-out ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'} ${className}`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
}

/* ═══════════════════════════════════════════════
   Shared card
   ═══════════════════════════════════════════════ */

function GlassCard({
  children,
  className = '',
  hover = false,
}: {
  children: ReactNode;
  className?: string;
  hover?: boolean;
}) {
  return (
    <div
      className={[
        'rounded-2xl border border-white/60 bg-white/80 shadow-[0_1px_3px_rgba(15,23,42,0.04),0_8px_28px_rgba(15,23,42,0.06)] backdrop-blur-sm',
        hover &&
          'transition-all duration-300 hover:shadow-[0_1px_3px_rgba(15,23,42,0.04),0_16px_48px_rgba(15,23,42,0.10)] hover:border-[rgba(212,136,58,0.2)]',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {children}
    </div>
  );
}

/* ═══════════════════════════════════════════════
   Landing
   ═══════════════════════════════════════════════ */

export default function Landing() {
  return (
    <MarketingShell>
      {/* ══════════════ HERO ══════════════ */}
      <section className="relative overflow-hidden">
        <div className="mx-auto max-w-7xl px-6 pb-8 pt-20 md:pb-12 md:pt-28 lg:pt-32">
          <div className="mx-auto max-w-4xl text-center">
            <Reveal>
              <div className="mb-8 inline-flex items-center gap-2.5 rounded-full border border-[#D4883A]/20 bg-[#D4883A]/[0.06] px-5 py-2 text-sm font-semibold text-[#b87430]">
                <Sparkles className="h-4 w-4" />
                Pipeline intelligence for real estate
              </div>
            </Reveal>

            <Reveal delay={80}>
              <h1 className="text-5xl font-extrabold leading-[1.05] tracking-tight text-slate-900 sm:text-6xl md:text-7xl">
                Your deals.{' '}
                <span className="animate-gradient-x bg-gradient-to-r from-[#1e3a5f] via-[#D4883A] to-[#1e3a5f] bg-clip-text text-transparent">
                  In focus.
                </span>
              </h1>
            </Reveal>

            <Reveal delay={160}>
              <p className="mx-auto mt-7 max-w-2xl text-lg leading-relaxed text-slate-500 md:text-xl md:leading-relaxed">
                Pipeline, commissions, marketing ROI, market data, and AI —
                unified in one platform built exclusively for real estate
                professionals.
              </p>
            </Reveal>

            <Reveal delay={240}>
              <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
                <Link
                  to="/pricing"
                  className="animate-glow inline-flex items-center gap-2.5 rounded-full bg-[#1e3a5f] px-9 py-4 text-base font-semibold text-white transition-all hover:brightness-110"
                >
                  Start free trial <ArrowRight className="h-5 w-5" />
                </Link>
                <Link
                  to="/contact-sales"
                  className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-8 py-4 text-base font-semibold text-slate-700 shadow-sm transition-all hover:border-slate-300 hover:shadow-md"
                >
                  Book a demo <ArrowUpRight className="h-4 w-4" />
                </Link>
              </div>
            </Reveal>

            <Reveal delay={320}>
              <div className="mt-8 flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-sm text-slate-400">
                {['Free 14-day trial', 'No credit card required', 'Cancel anytime'].map((t) => (
                  <span key={t} className="inline-flex items-center gap-2">
                    <Check className="h-4 w-4 text-emerald-500" /> {t}
                  </span>
                ))}
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ══════════════ PRODUCT PREVIEW ══════════════ */}
      <section className="relative pb-20 md:pb-28">
        <div className="mx-auto max-w-6xl px-6">
          <Reveal>
            <GlassCard className="p-2 shadow-[0_2px_4px_rgba(15,23,42,0.04),0_24px_68px_rgba(15,23,42,0.08)]">
              <div className="rounded-xl bg-gradient-to-b from-white to-slate-50/80 p-6 md:p-8">
                {/* browser chrome */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="h-3 w-3 rounded-full bg-rose-400/70" />
                    <div className="h-3 w-3 rounded-full bg-amber-400/70" />
                    <div className="h-3 w-3 rounded-full bg-emerald-400/70" />
                  </div>
                  <div className="inline-flex items-center gap-2 rounded-full border border-slate-100 bg-white px-3 py-1 text-xs font-semibold text-slate-600">
                    <Gauge className="h-3.5 w-3.5 text-[#1e3a5f]" /> Live dashboard
                  </div>
                </div>

                {/* metric cards */}
                <div className="mt-6 grid gap-3 sm:grid-cols-4">
                  {[
                    { label: 'Active deals', value: '24', change: '+3' },
                    { label: 'Pipeline value', value: '$1.8M', change: '+12%' },
                    { label: 'Close rate', value: '28%', change: '+4%' },
                    { label: 'YTD GCI', value: '$142K', change: '+18%' },
                  ].map((s) => (
                    <div
                      key={s.label}
                      className="rounded-xl border border-slate-100 bg-white p-4"
                    >
                      <div className="text-xs font-medium text-slate-400">{s.label}</div>
                      <div className="mt-1.5 flex items-baseline gap-2">
                        <span className="text-2xl font-bold tracking-tight text-slate-900">
                          {s.value}
                        </span>
                        <span className="text-xs font-semibold text-emerald-600">{s.change}</span>
                      </div>
                    </div>
                  ))}
                </div>

                {/* pipeline + insights */}
                <div className="mt-4 grid gap-3 md:grid-cols-[1fr_280px]">
                  <div className="rounded-xl border border-slate-100 bg-white p-5">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-slate-900">Pipeline stages</span>
                      <span className="text-xs text-slate-400">This quarter</span>
                    </div>
                    <div className="mt-5 space-y-3.5">
                      {[
                        { name: 'New leads', pct: 32, count: 14 },
                        { name: 'Contacted', pct: 26, count: 11 },
                        { name: 'Showing', pct: 22, count: 9 },
                        { name: 'Under contract', pct: 20, count: 8 },
                      ].map((row) => (
                        <div key={row.name}>
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-medium text-slate-600">{row.name}</span>
                            <span className="text-slate-400">{row.count} deals</span>
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
                        tone: 'text-emerald-600',
                        bg: 'bg-emerald-500/10',
                        title: 'Commission forecast',
                        body: '$38K projected GCI from 4 deals closing this month.',
                      },
                      {
                        icon: Megaphone,
                        tone: 'text-sky-700',
                        bg: 'bg-sky-500/10',
                        title: 'Marketing ROI',
                        body: 'Google Ads: $2.4K spend → 6 closed deals. Best channel.',
                      },
                    ].map((c) => (
                      <div
                        key={c.title}
                        className="rounded-xl border border-slate-100 bg-white p-4"
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${c.bg} ${c.tone}`}
                          >
                            <c.icon className="h-4 w-4" />
                          </div>
                          <div className="min-w-0">
                            <div className="text-xs font-semibold text-slate-900">{c.title}</div>
                            <div className="mt-0.5 text-xs leading-snug text-slate-500">
                              {c.body}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </GlassCard>
          </Reveal>
        </div>
      </section>

      {/* ══════════════ PLATFORM CAPABILITIES ══════════════ */}
      <section
        id="platform"
        className="relative border-t border-slate-200/40 py-24 md:py-32"
        style={{
          backgroundImage:
            'radial-gradient(circle, rgba(30,58,95,0.03) 1px, transparent 1px)',
          backgroundSize: '24px 24px',
        }}
      >
        <div className="mx-auto max-w-7xl px-6">
          <Reveal>
            <div className="mx-auto max-w-2xl text-center">
              <p className="text-sm font-bold uppercase tracking-[0.15em] text-[#D4883A]">
                Platform
              </p>
              <h2 className="mt-4 text-3xl font-extrabold tracking-tight text-slate-900 md:text-4xl lg:text-5xl">
                Everything you need to close more and keep more
              </h2>
              <p className="mt-5 text-lg leading-relaxed text-slate-500">
                Pipeline management, commission tracking, marketing attribution, market data, AI insights, and team controls — in a single workspace.
              </p>
            </div>
          </Reveal>

          <div className="mt-16 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {CAPABILITIES.map((cap, i) => (
              <Reveal key={cap.title} delay={i * 60}>
                <GlassCard hover className="group h-full p-6">
                  <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-[#1e3a5f]/[0.08] text-[#1e3a5f] transition-all duration-300 group-hover:bg-[#1e3a5f] group-hover:text-white group-hover:shadow-lg group-hover:shadow-[#1e3a5f]/20">
                    <cap.icon className="h-5 w-5" />
                  </div>
                  <h3 className="mt-5 text-base font-bold text-slate-900">{cap.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-500">{cap.desc}</p>
                </GlassCard>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════ WHY LUMA-IQ ══════════════ */}
      <section className="border-t border-slate-200/40 bg-gradient-to-b from-slate-50/80 to-[#fafbfe] py-24 md:py-32">
        <div className="mx-auto max-w-7xl px-6">
          <div className="grid items-center gap-16 lg:grid-cols-2">
            <Reveal>
              <div>
                <p className="text-sm font-bold uppercase tracking-[0.15em] text-[#D4883A]">
                  Why Luma-IQ
                </p>
                <h2 className="mt-4 text-3xl font-extrabold tracking-tight text-slate-900 md:text-4xl">
                  Not another generic CRM with a real estate skin
                </h2>
                <p className="mt-5 text-lg leading-relaxed text-slate-500">
                  Most tools bolt on real estate features as an afterthought.
                  Luma-IQ was designed from the ground up for how agents and
                  teams actually work.
                </p>

                <div className="mt-10 space-y-7">
                  {DIFFERENTIATORS.map((d) => (
                    <div key={d.title} className="flex gap-4">
                      <div className="mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#1e3a5f]/[0.08] text-[#1e3a5f]">
                        <d.icon className="h-5 w-5" />
                      </div>
                      <div>
                        <h3 className="text-base font-bold text-slate-900">{d.title}</h3>
                        <p className="mt-1.5 text-sm leading-relaxed text-slate-500">{d.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </Reveal>

            <Reveal delay={120}>
              <GlassCard className="p-7 md:p-8">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-slate-900">Lead source performance</span>
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-500">
                    Last 90 days
                  </span>
                </div>

                <div className="mt-6 space-y-3">
                  {[
                    { source: 'Google Ads', leads: 48, closed: 6, spend: '$2.4K', gci: '$42K', dot: 'bg-[#D4883A]' },
                    { source: 'Zillow', leads: 32, closed: 3, spend: '$1.8K', gci: '$28K', dot: 'bg-[#1e3a5f]' },
                    { source: 'Referrals', leads: 18, closed: 5, spend: '$0', gci: '$61K', dot: 'bg-emerald-500' },
                    { source: 'Meta Ads', leads: 26, closed: 2, spend: '$1.2K', gci: '$16K', dot: 'bg-amber-500' },
                  ].map((row) => (
                    <div
                      key={row.source}
                      className="rounded-xl border border-slate-100 bg-white p-4 transition-colors hover:border-slate-200"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className={`h-2.5 w-2.5 rounded-full ${row.dot}`} />
                          <span className="text-sm font-semibold text-slate-900">{row.source}</span>
                        </div>
                        <span className="text-xs font-bold text-emerald-600">{row.gci} GCI</span>
                      </div>
                      <div className="mt-2 flex gap-4 text-xs text-slate-400">
                        <span>{row.leads} leads</span>
                        <span>{row.closed} closed</span>
                        <span>{row.spend} spent</span>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-5 rounded-xl border border-[#D4883A]/15 bg-gradient-to-r from-[#D4883A]/[0.06] to-[#D4883A]/[0.02] p-4">
                  <div className="flex items-start gap-3">
                    <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-[#D4883A]" />
                    <span className="text-sm font-medium text-slate-600">
                      Referrals generated the highest GCI per dollar. Consider
                      increasing referral incentives.
                    </span>
                  </div>
                </div>
              </GlassCard>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ══════════════ INTEGRATIONS ══════════════ */}
      <section
        className="border-t border-slate-200/40 py-24 md:py-32"
        style={{
          backgroundImage:
            'radial-gradient(circle, rgba(30,58,95,0.03) 1px, transparent 1px)',
          backgroundSize: '24px 24px',
        }}
      >
        <div className="mx-auto max-w-7xl px-6">
          <Reveal>
            <div className="mx-auto max-w-2xl text-center">
              <p className="text-sm font-bold uppercase tracking-[0.15em] text-[#D4883A]">
                Integrations
              </p>
              <h2 className="mt-4 text-3xl font-extrabold tracking-tight text-slate-900 md:text-4xl">
                Connects to the tools you already use
              </h2>
              <p className="mt-5 text-lg leading-relaxed text-slate-500">
                No rip-and-replace. Plug in your email, marketing channels,
                and transaction tools — and start working.
              </p>
            </div>
          </Reveal>

          <div className="mx-auto mt-14 grid max-w-4xl gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {INTEGRATIONS.map((int, i) => (
              <Reveal key={int.name} delay={i * 50}>
                <div className="flex items-center gap-4 rounded-xl border border-slate-100 bg-white/80 p-4 shadow-sm transition-all duration-200 hover:border-slate-200 hover:bg-white hover:shadow-md">
                  <div className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#1e3a5f]/[0.07] text-[#1e3a5f]">
                    <int.icon className="h-4.5 w-4.5" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-slate-900">{int.name}</div>
                    <div className="mt-0.5 text-xs text-slate-400">{int.desc}</div>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════ HOW IT WORKS ══════════════ */}
      <section className="border-t border-slate-200/40 bg-gradient-to-b from-slate-50/80 to-[#fafbfe] py-24 md:py-32">
        <div className="mx-auto max-w-7xl px-6">
          <Reveal>
            <div className="mx-auto max-w-2xl text-center">
              <p className="text-sm font-bold uppercase tracking-[0.15em] text-[#D4883A]">
                Get started
              </p>
              <h2 className="mt-4 text-3xl font-extrabold tracking-tight text-slate-900 md:text-4xl">
                Live in minutes — not months
              </h2>
              <p className="mt-5 text-lg leading-relaxed text-slate-500">
                No implementation project. No consultant. No IT department.
              </p>
            </div>
          </Reveal>

          <div className="mx-auto mt-16 grid max-w-5xl gap-8 lg:grid-cols-3">
            {STEPS.map((s, i) => (
              <Reveal key={s.num} delay={i * 100}>
                <div className="relative flex h-full flex-col">
                  {i < STEPS.length - 1 && (
                    <div className="absolute right-0 top-10 hidden h-px w-8 translate-x-full bg-gradient-to-r from-slate-200 to-transparent lg:block" />
                  )}

                  <GlassCard className="flex flex-1 flex-col p-8">
                    <span className="text-4xl font-extrabold text-[#1e3a5f]/[0.08]">
                      {s.num}
                    </span>
                    <div className="mt-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-[#1e3a5f]/[0.08] text-[#1e3a5f]">
                      <s.icon className="h-5 w-5" />
                    </div>
                    <h3 className="mt-5 text-lg font-bold text-slate-900">{s.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-slate-500">{s.desc}</p>
                  </GlassCard>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════ FAQ ══════════════ */}
      <section className="border-t border-slate-200/40 py-24 md:py-32">
        <div className="mx-auto max-w-7xl px-6">
          <Reveal>
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="text-3xl font-extrabold tracking-tight text-slate-900 md:text-4xl">
                Frequently asked questions
              </h2>
              <p className="mt-4 text-lg text-slate-500">
                Everything you need to know before getting started.
              </p>
            </div>
          </Reveal>

          <Reveal delay={80}>
            <div className="mx-auto mt-14 max-w-3xl divide-y divide-slate-100 rounded-2xl border border-slate-100 bg-white/90 px-8 shadow-sm backdrop-blur">
              {FAQ.map((f) => (
                <details
                  key={f.q}
                  className="group py-6 [&_summary::-webkit-details-marker]:hidden"
                >
                  <summary className="flex cursor-pointer items-center justify-between gap-6">
                    <span className="text-base font-semibold text-slate-900 transition group-hover:text-[#1e3a5f]">
                      {f.q}
                    </span>
                    <ChevronRight className="h-5 w-5 shrink-0 text-slate-300 transition-transform duration-200 group-open:rotate-90" />
                  </summary>
                  <p className="mt-3 pr-10 text-[15px] leading-relaxed text-slate-500">
                    {f.a}
                  </p>
                </details>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* ══════════════ CTA ══════════════ */}
      <section className="relative overflow-hidden border-t border-slate-200/40 bg-gradient-to-br from-[#0f1f33] via-[#152d4a] to-[#1e3a5f]">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              'radial-gradient(circle, rgba(255,255,255,0.03) 1px, transparent 1px)',
            backgroundSize: '32px 32px',
          }}
        />
        <div
          aria-hidden
          className="animate-float pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-[#D4883A]/10 blur-[100px]"
        />
        <div
          aria-hidden
          className="animate-float-slow pointer-events-none absolute -bottom-24 -left-24 h-72 w-72 rounded-full bg-indigo-500/10 blur-[100px]"
        />

        <div className="relative mx-auto max-w-7xl px-6 py-24 text-center md:py-32">
          <Reveal>
            <h2 className="text-3xl font-extrabold tracking-tight text-white md:text-4xl lg:text-5xl">
              Your pipeline deserves better
              <br className="hidden sm:block" /> than a spreadsheet
            </h2>
          </Reveal>
          <Reveal delay={80}>
            <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-slate-300">
              See your deals, commissions, marketing ROI, and market context —
              in one place. Get started in minutes.
            </p>
          </Reveal>
          <Reveal delay={160}>
            <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Link
                to="/pricing"
                className="inline-flex items-center gap-2.5 rounded-full bg-white px-9 py-4 text-base font-semibold text-[#0f1f33] shadow-lg shadow-black/10 transition-all hover:shadow-xl hover:brightness-105"
              >
                Start free trial <ArrowRight className="h-5 w-5" />
              </Link>
              <Link
                to="/contact-sales"
                className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.06] px-8 py-4 text-base font-semibold text-white backdrop-blur transition-all hover:bg-white/[0.12]"
              >
                Book a demo
              </Link>
            </div>
          </Reveal>
        </div>
      </section>
    </MarketingShell>
  );
}
