import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PageShell } from '../ui/PageShell';
import { PageHeader } from '../ui/PageHeader';
import { Text } from '../ui/Text';
import { ui } from '../ui/tokens';
import { useAuth } from '../contexts/AuthContext';
import {
  getOrCreateWallet,
  addFunding,
  getTransactions,
  getChannels,
  getAllocations,
  setAllocation,
  getPerformance,
  getInsights,
  listIntegrations,
  getChannelAllocationRecommendations,
} from '../services/marketing.service';
import type { MarketingAllocation as AllocationType } from '../types/marketing';
import { Link } from 'react-router-dom';
import {
  Wallet,
  Lightbulb,
  Plus,
  Pause,
  Play,
  ArrowUpRight,
  ArrowDownRight,
  Link2,
} from 'lucide-react';
import toast from 'react-hot-toast';

function formatDollars(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

export default function Marketing() {
  const { user } = useAuth();
  const userId = user?.id ?? '';
  const qc = useQueryClient();
  const [fundAmount, setFundAmount] = useState('');
  const [showFundModal, setShowFundModal] = useState(false);

  const { data: wallet, isLoading: walletLoading } = useQuery({
    queryKey: ['marketing', 'wallet', userId],
    queryFn: () => getOrCreateWallet(userId),
    enabled: !!userId,
  });

  const { data: transactions = [], isLoading: txLoading } = useQuery({
    queryKey: ['marketing', 'transactions', wallet?.id],
    queryFn: () => getTransactions(wallet!.id, 20),
    enabled: !!wallet?.id,
  });

  const { data: channels = [] } = useQuery({
    queryKey: ['marketing', 'channels'],
    queryFn: getChannels,
  });

  const { data: integrations = [] } = useQuery({
    queryKey: ['marketing', 'integrations', userId],
    queryFn: () => listIntegrations(userId),
    enabled: !!userId,
  });

  const { data: allocations = [], isLoading: allocLoading } = useQuery({
    queryKey: ['marketing', 'allocations', wallet?.id],
    queryFn: () => getAllocations(wallet!.id),
    enabled: !!wallet?.id,
  });

  const { data: performance, isLoading: perfLoading } = useQuery({
    queryKey: ['marketing', 'performance', userId],
    queryFn: () => getPerformance(userId),
    enabled: !!userId,
  });

  const { data: insights = [] } = useQuery({
    queryKey: ['marketing', 'insights', userId],
    queryFn: () => getInsights(userId),
    enabled: !!userId,
  });

  const { data: allocationRecommendations = [] } = useQuery({
    queryKey: ['marketing', 'allocation-recommendations', userId],
    queryFn: () => getChannelAllocationRecommendations(userId),
    enabled: !!userId,
  });
  const recommendationByChannel = allocationRecommendations.reduce(
    (acc, r) => {
      acc[r.channel_id] = r;
      return acc;
    },
    {} as Record<string, { recommended_monthly_budget_cents: number; reason: string }>
  );

  const addFundingMutation = useMutation({
    mutationFn: ({ amountCents }: { amountCents: number }) =>
      addFunding(wallet!.id, amountCents, 'one_time'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['marketing'] });
      setFundAmount('');
      setShowFundModal(false);
      toast.success('Funds added to wallet');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const setAllocationMutation = useMutation({
    mutationFn: ({
      channelId,
      monthlyBudgetCents,
      isPaused,
    }: {
      channelId: string;
      monthlyBudgetCents: number;
      isPaused: boolean;
    }) => setAllocation(wallet!.id, channelId, monthlyBudgetCents, isPaused),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['marketing'] });
      toast.success('Allocation updated');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const handleAddFunds = useCallback(() => {
    const dollars = parseFloat(fundAmount);
    if (Number.isNaN(dollars) || dollars <= 0) {
      toast.error('Enter a valid amount');
      return;
    }
    addFundingMutation.mutate({ amountCents: Math.round(dollars * 100) });
  }, [fundAmount, addFundingMutation]);

  const allocationByChannel = allocations.reduce(
    (acc, a) => {
      acc[a.channel_id] = a;
      return acc;
    },
    {} as Record<string, AllocationType & { channel?: { name: string; slug: string } }>
  );

  const header = (
    <PageHeader
      label="Marketing"
      title="Intelligent Marketing Engine"
      subtitle="Fund your wallet, allocate budget to channels, and track performance."
    />
  );

  return (
    <PageShell
      title={header}
      actions={
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowFundModal(true)}
            className="inline-flex items-center gap-2 rounded-xl border border-[var(--app-border)] bg-white px-4 py-2.5 text-sm font-medium text-gray-800 shadow-sm hover:bg-gray-50 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Add funds
          </button>
        </div>
      }
    >
      <div className="space-y-8 animate-fade-in">
        {/* Wallet */}
        <section>
          <Text as="span" variant="micro" className={ui.tone.subtle}>
            WALLET
          </Text>
          <div className="mt-2 grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div
              className={`rounded-xl border ${ui.border.card} ${ui.shadow.card} bg-white p-5 ${walletLoading ? 'animate-pulse' : ''}`}
            >
              <div className="flex items-center gap-2 text-gray-500 text-sm">
                <Wallet className="h-4 w-4" />
                Balance
              </div>
              <p className="mt-1 text-2xl font-semibold text-gray-900">
                {wallet ? formatDollars(wallet.balance_cents) : '—'}
              </p>
            </div>
            <div className={`rounded-xl border ${ui.border.card} bg-white p-5 ${walletLoading ? 'animate-pulse' : ''}`}>
              <div className="text-gray-500 text-sm">Total funded</div>
              <p className="mt-1 text-xl font-medium text-gray-800">
                {wallet ? formatDollars(wallet.total_funded_cents) : '—'}
              </p>
            </div>
            <div className={`rounded-xl border ${ui.border.card} bg-white p-5 ${walletLoading ? 'animate-pulse' : ''}`}>
              <div className="text-gray-500 text-sm">Total spend</div>
              <p className="mt-1 text-xl font-medium text-gray-800">
                {wallet ? formatDollars(wallet.total_spent_cents) : '—'}
              </p>
            </div>
          </div>
          {/* Transaction history */}
          <div className="mt-4 rounded-xl border border-gray-200 bg-white overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100">
              <Text as="span" variant="micro" className={ui.tone.subtle}>
                RECENT TRANSACTIONS
              </Text>
            </div>
            <ul className="divide-y divide-gray-100">
              {txLoading ? (
                <li className="px-4 py-6 text-center text-gray-400 text-sm">Loading…</li>
              ) : transactions.length === 0 ? (
                <li className="px-4 py-6 text-center text-gray-400 text-sm">No transactions yet.</li>
              ) : (
                transactions.slice(0, 10).map((tx) => (
                  <li key={tx.id} className="px-4 py-3 flex items-center justify-between text-sm">
                    <span className={tx.type === 'credit' ? 'text-emerald-600' : 'text-gray-700'}>
                      {tx.type === 'credit' ? (
                        <ArrowDownRight className="inline h-4 w-4 mr-1" />
                      ) : (
                        <ArrowUpRight className="inline h-4 w-4 mr-1" />
                      )}
                      {tx.description ?? (tx.type === 'credit' ? 'Funding' : 'Spend')}
                    </span>
                    <span className={tx.type === 'credit' ? 'text-emerald-600 font-medium' : 'text-gray-800'}>
                      {tx.type === 'credit' ? '+' : '-'}{formatDollars(tx.amount_cents)}
                    </span>
                  </li>
                ))
              )}
            </ul>
          </div>
        </section>

        {/* Allocation — only channels connected in Integrations (Growth Engine) get budget controls */}
        <section>
          <Text as="span" variant="micro" className={ui.tone.subtle}>
            CHANNEL ALLOCATION
          </Text>
          <p className="mt-1 text-sm text-gray-600">
            Set monthly budget per channel. Only channels you connected in Settings → Integrations appear here.
          </p>
          {(() => {
            const connectedChannels = channels.filter((ch) =>
              integrations.some((i) => i.provider === ch.slug)
            );
            if (connectedChannels.length === 0) {
              return (
                <div className="mt-3 rounded-xl border border-dashed border-gray-200 bg-gray-50/50 p-6 text-center">
                  <p className="text-sm text-gray-600">
                    No channels connected yet. Connect accounts in Integrations to allocate budget.
                  </p>
                  <Link
                    to="/workspace-settings?section=integrations"
                    className="mt-3 inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-[#1e3a5f] text-[#1e3a5f] text-sm font-medium hover:bg-[#1e3a5f]/5"
                  >
                    <Link2 className="h-4 w-4" />
                    Go to Integrations
                  </Link>
                </div>
              );
            }
            return (
              <>
                <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-4">
                  {connectedChannels.map((ch) => {
                    const alloc = allocationByChannel[ch.id];
                    const budgetCents = alloc?.monthly_budget_cents ?? 0;
                    const isPaused = alloc?.is_paused ?? false;
                    const budgetStr = (budgetCents / 100).toFixed(0);
                    const recommendation = recommendationByChannel[ch.id];
                    const suggestedCents = recommendation?.recommended_monthly_budget_cents ?? 0;
                    const suggestedStr = (suggestedCents / 100).toFixed(0);
                    const showSuggestion = recommendation && suggestedCents >= 0;
                    return (
                      <div
                        key={ch.id}
                        className={`rounded-xl border ${ui.border.card} bg-white p-5 ${allocLoading ? 'animate-pulse' : ''}`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-gray-900">{ch.name}</span>
                          <button
                            type="button"
                            onClick={() =>
                              setAllocationMutation.mutate({
                                channelId: ch.id,
                                monthlyBudgetCents: budgetCents,
                                isPaused: !isPaused,
                              })
                            }
                            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100"
                          >
                            {isPaused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
                            {isPaused ? 'Resume' : 'Pause'}
                          </button>
                        </div>
                        {showSuggestion && (
                          <p className="mt-2 text-xs text-gray-600">
                            Luma suggests ${suggestedStr}/mo — {recommendation.reason}
                          </p>
                        )}
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <span className="text-gray-500 text-sm">Monthly budget</span>
                          <input
                            key={`${ch.id}-${budgetCents}`}
                            type="number"
                            min={0}
                            step={50}
                            defaultValue={budgetStr}
                            onBlur={(e) => {
                              const v = Math.max(0, parseInt(e.target.value, 10) || 0);
                              if (v * 100 !== budgetCents) {
                                setAllocationMutation.mutate({
                                  channelId: ch.id,
                                  monthlyBudgetCents: v * 100,
                                  isPaused,
                                });
                              }
                            }}
                            className="w-24 rounded-lg border border-gray-200 px-2 py-1.5 text-sm"
                          />
                          <span className="text-gray-400 text-sm">/ month</span>
                          {showSuggestion && suggestedCents !== budgetCents && (
                            <button
                              type="button"
                              onClick={() =>
                                setAllocationMutation.mutate({
                                  channelId: ch.id,
                                  monthlyBudgetCents: suggestedCents,
                                  isPaused,
                                })
                              }
                              className="inline-flex items-center rounded-lg px-2.5 py-1.5 text-xs font-medium text-[#1e3a5f] bg-[#1e3a5f]/10 hover:bg-[#1e3a5f]/20"
                            >
                              Use suggestion
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <p className="mt-3 text-xs text-gray-500">
                  To add more channels, connect accounts in Settings → Integrations.
                </p>
              </>
            );
          })()}
        </section>

        {/* Performance — only channels the user has connected */}
        <section>
          <Text as="span" variant="micro" className={ui.tone.subtle}>
            PERFORMANCE
          </Text>
          <p className="mt-1 text-sm text-gray-600">
            Cost per lead, spend vs pipeline value, ROI for your connected channels. Connect lead sources in Settings for attribution.
          </p>
          {perfLoading ? (
            <div className="mt-3 h-40 rounded-xl bg-gray-50 animate-pulse" />
          ) : performance ? (
            (() => {
              const connectedSlugs = new Set(integrations.map((i) => i.provider));
              const connectedChannelPerf =
                performance.by_channel?.filter((c) => connectedSlugs.has(c.channel_slug)) ?? [];
              const totalSpend = connectedChannelPerf.reduce((s, c) => s + c.spend_cents, 0);
              const totalLeads = connectedChannelPerf.reduce((s, c) => s + c.leads_count, 0);
              const totalPipelineValue = connectedChannelPerf.reduce(
                (s, c) => s + c.pipeline_value_cents,
                0
              );
              const costPerLead =
                totalLeads > 0 ? Math.round(totalSpend / totalLeads) : null;
              const roiPercent =
                totalSpend > 0
                  ? Math.round(
                      ((totalPipelineValue / 100 - totalSpend / 100) / (totalSpend / 100)) * 100
                    )
                  : null;
              return (
                <>
                  <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <div className="rounded-xl border border-gray-200 bg-white p-4">
                      <div className="text-gray-500 text-xs font-medium">Total spend</div>
                      <p className="mt-0.5 text-lg font-semibold text-gray-900">
                        {formatDollars(totalSpend)}
                      </p>
                    </div>
                    <div className="rounded-xl border border-gray-200 bg-white p-4">
                      <div className="text-gray-500 text-xs font-medium">Leads</div>
                      <p className="mt-0.5 text-lg font-semibold text-gray-900">{totalLeads}</p>
                    </div>
                    <div className="rounded-xl border border-gray-200 bg-white p-4">
                      <div className="text-gray-500 text-xs font-medium">Cost per lead</div>
                      <p className="mt-0.5 text-lg font-semibold text-gray-900">
                        {costPerLead != null ? formatDollars(costPerLead) : '—'}
                      </p>
                    </div>
                    <div className="rounded-xl border border-gray-200 bg-white p-4">
                      <div className="text-gray-500 text-xs font-medium">ROI (est.)</div>
                      <p className="mt-0.5 text-lg font-semibold text-gray-900">
                        {roiPercent != null ? `${roiPercent}%` : '—'}
                      </p>
                    </div>
                  </div>
                  {connectedChannelPerf.length > 0 ? (
                    <div className="mt-4 rounded-xl border border-gray-200 bg-white overflow-hidden">
                      <div className="px-4 py-3 border-b border-gray-100 text-sm font-medium text-gray-700">
                        By channel
                      </div>
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left text-gray-500 border-b border-gray-100">
                            <th className="px-4 py-2">Channel</th>
                            <th className="px-4 py-2">Spend</th>
                            <th className="px-4 py-2">Leads</th>
                            <th className="px-4 py-2">CPL</th>
                            <th className="px-4 py-2">ROI</th>
                          </tr>
                        </thead>
                        <tbody>
                          {connectedChannelPerf.map((c) => (
                            <tr key={c.channel_id} className="border-b border-gray-50 last:border-0">
                              <td className="px-4 py-3 font-medium text-gray-800">{c.channel_name}</td>
                              <td className="px-4 py-3">{formatDollars(c.spend_cents)}</td>
                              <td className="px-4 py-3">{c.leads_count}</td>
                              <td className="px-4 py-3">
                                {c.cost_per_lead_cents != null
                                  ? formatDollars(c.cost_per_lead_cents)
                                  : '—'}
                              </td>
                              <td className="px-4 py-3">
                                {c.roi_percent != null ? `${c.roi_percent}%` : '—'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="mt-3 text-sm text-gray-500">
                      Connect channels in Settings → Integrations to see performance here.
                    </p>
                  )}
                </>
              );
            })()
          ) : null}
        </section>

        {/* Insights */}
        {insights.length > 0 && (
          <section>
            <Text as="span" variant="micro" className={ui.tone.subtle}>
              INSIGHTS
            </Text>
            <div className="mt-2 flex flex-wrap gap-3">
              {insights.map((ins) => (
                <div
                  key={ins.id}
                  className={`rounded-xl border p-4 max-w-md ${
                    ins.type === 'success'
                      ? 'border-emerald-200 bg-emerald-50/80'
                      : ins.type === 'warning'
                        ? 'border-amber-200 bg-amber-50/80'
                        : 'border-gray-200 bg-gray-50/80'
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <Lightbulb
                      className={`h-4 w-4 mt-0.5 flex-shrink-0 ${
                        ins.type === 'success' ? 'text-emerald-600' : ins.type === 'warning' ? 'text-amber-600' : 'text-gray-500'
                      }`}
                    />
                    <div>
                      <p className="font-medium text-gray-900 text-sm">{ins.title}</p>
                      <p className="text-sm text-gray-600 mt-0.5">{ins.message}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>

      {/* Add funds modal */}
      {showFundModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={() => setShowFundModal(false)}>
          <div
            className="rounded-2xl bg-white shadow-xl max-w-sm w-full p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-gray-900">Add funds</h3>
            <p className="text-sm text-gray-600 mt-1">One-time funding to your marketing wallet.</p>
            <div className="mt-4">
              <label className="block text-sm font-medium text-gray-700">Amount (USD)</label>
              <input
                type="number"
                min={1}
                step={50}
                value={fundAmount}
                onChange={(e) => setFundAmount(e.target.value)}
                placeholder="0"
                className="mt-1 w-full rounded-xl border border-gray-200 px-4 py-2.5 text-lg"
              />
            </div>
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => setShowFundModal(false)}
                className="flex-1 rounded-xl border border-gray-200 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleAddFunds}
                disabled={addFundingMutation.isPending || !fundAmount}
                className="flex-1 rounded-xl bg-[#1e3a5f] py-2.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
              >
                {addFundingMutation.isPending ? 'Adding…' : 'Add funds'}
              </button>
            </div>
          </div>
        </div>
      )}
    </PageShell>
  );
}
