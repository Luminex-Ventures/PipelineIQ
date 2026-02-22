import { Link } from 'react-router-dom';
import { ArrowRight, Check, Sparkles } from 'lucide-react';
import { PLANS } from '../config/plans';
import MarketingShell from '../components/marketing/MarketingShell';

export default function Pricing() {
  return (
    <MarketingShell>
      {/* hero */}
      <section className="pb-6 pt-20 md:pt-28">
        <div className="mx-auto max-w-7xl px-6 text-center">
          <div className="mb-6 inline-flex items-center gap-2.5 rounded-full border border-[#D4883A]/20 bg-[#D4883A]/[0.06] px-5 py-2 text-sm font-semibold text-[#b87430]">
            <Sparkles className="h-4 w-4" />
            Simple, transparent pricing
          </div>
          <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 md:text-5xl lg:text-6xl">
            Plans that scale with you
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-slate-500">
            Start as an independent agent or bring your team. Upgrade,
            downgrade, or cancel anytime — your data stays with you.
          </p>
        </div>
      </section>

      {/* plan cards */}
      <section className="pb-24 pt-10 md:pb-32">
        <div className="mx-auto max-w-7xl px-6">
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {PLANS.map((plan, idx) => {
              const isPopular = idx === 1;
              return (
                <div
                  key={plan.code}
                  className={[
                    'relative flex flex-col overflow-hidden rounded-2xl border bg-white/80 shadow-[0_1px_3px_rgba(15,23,42,0.04),0_8px_28px_rgba(15,23,42,0.06)] backdrop-blur-sm transition-all duration-300 hover:shadow-[0_1px_3px_rgba(15,23,42,0.04),0_16px_48px_rgba(15,23,42,0.10)]',
                    isPopular
                      ? 'border-[#D4883A]/30 ring-1 ring-[#D4883A]/20'
                      : 'border-white/60',
                  ].join(' ')}
                >
                  {isPopular && (
                    <div className="bg-gradient-to-r from-[#1e3a5f] to-[#D4883A] px-4 py-1.5 text-center text-xs font-bold uppercase tracking-wider text-white">
                      Most popular
                    </div>
                  )}

                  <div className="border-b border-slate-100 p-7">
                    <h2 className="text-lg font-bold text-slate-900">{plan.name}</h2>
                    <p className="mt-1 text-sm text-slate-500">{plan.description}</p>
                    <p className="mt-5 text-3xl font-extrabold tracking-tight text-slate-900">
                      {plan.priceLabel}
                    </p>
                  </div>

                  <ul className="flex-1 space-y-3.5 p-7">
                    {plan.features.map((f, i) => (
                      <li key={i} className="flex items-start gap-2.5 text-sm text-slate-600">
                        {f.included ? (
                          <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                        ) : (
                          <span className="mt-0.5 h-4 w-4 shrink-0 rounded-full bg-slate-100" />
                        )}
                        <span>{f.label}</span>
                      </li>
                    ))}
                  </ul>

                  <div className="p-7 pt-0">
                    {plan.isEnterprise ? (
                      <Link
                        to={`/contact-sales?plan=${plan.code}`}
                        className="flex w-full items-center justify-center gap-2 rounded-full border border-slate-200 bg-white py-3.5 text-sm font-semibold text-slate-700 shadow-sm transition-all hover:border-slate-300 hover:shadow-md"
                      >
                        {plan.cta}
                      </Link>
                    ) : (
                      <Link
                        to={`/signup?plan=${plan.code}`}
                        className={[
                          'flex w-full items-center justify-center gap-2 rounded-full py-3.5 text-sm font-semibold text-white shadow-md transition-all hover:brightness-110',
                          isPopular
                            ? 'bg-gradient-to-r from-[#1e3a5f] to-[#D4883A] shadow-[#1e3a5f]/20'
                            : 'bg-[#1e3a5f] shadow-[#1e3a5f]/15',
                        ].join(' ')}
                      >
                        {plan.cta} <ArrowRight className="h-4 w-4" />
                      </Link>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* bottom note */}
          <p className="mt-12 text-center text-sm text-slate-400">
            All plans include a 14-day free trial. No credit card required.
          </p>
        </div>
      </section>
    </MarketingShell>
  );
}
