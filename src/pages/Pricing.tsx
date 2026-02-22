import { Link } from 'react-router-dom';
import { Check } from 'lucide-react';
import { PLANS } from '../config/plans';

export default function Pricing() {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <img src="/LumaIQ.png" alt="Luma-IQ" className="h-8" />
          </Link>
          <nav className="flex gap-4">
            <Link to="/pricing" className="text-gray-600 hover:text-gray-900 font-medium">
              Pricing
            </Link>
            <Link to="/login" className="text-gray-600 hover:text-gray-900 font-medium">
              Log in
            </Link>
          </nav>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-16">
        <div className="text-center mb-14">
          <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mb-3">
            Plans that scale with you
          </h1>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            Start as an independent agent or bring your team. Enterprise gets custom pricing and support.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          {PLANS.map((plan) => (
            <div
              key={plan.code}
              className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden flex flex-col"
            >
              <div className="p-6 border-b border-gray-100">
                <h2 className="text-lg font-semibold text-gray-900">{plan.name}</h2>
                <p className="text-sm text-gray-500 mt-1">{plan.description}</p>
                <p className="mt-4 text-2xl font-bold text-gray-900">{plan.priceLabel}</p>
              </div>
              <ul className="p-6 flex-1 space-y-3">
                {plan.features.map((f, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                    {f.included ? (
                      <Check className="h-4 w-4 text-emerald-500 flex-shrink-0 mt-0.5" />
                    ) : (
                      <span className="w-4 h-4 rounded-full bg-gray-200 flex-shrink-0 mt-0.5" />
                    )}
                    <span>{f.label}</span>
                  </li>
                ))}
              </ul>
              <div className="p-6 pt-0">
                {plan.isEnterprise ? (
                  <Link
                    to={`/contact-sales?plan=${plan.code}`}
                    className="block w-full text-center py-3 px-4 border border-gray-300 rounded-xl font-medium text-gray-700 hover:bg-gray-50"
                  >
                    {plan.cta}
                  </Link>
                ) : (
                  <Link
                    to={`/signup?plan=${plan.code}`}
                    className="block w-full text-center py-3 px-4 bg-[#1e3a5f] text-white rounded-xl font-medium hover:opacity-90"
                  >
                    {plan.cta}
                  </Link>
                )}
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
