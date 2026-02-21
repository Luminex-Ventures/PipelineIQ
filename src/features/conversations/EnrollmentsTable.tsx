import { Pause, Play } from 'lucide-react';
import { Text } from '../../ui/Text';
import { ui } from '../../ui/tokens';
import type { CampaignEnrollment } from '../../types/conversations';

interface EnrollmentsTableProps {
  enrollments: CampaignEnrollment[];
  onPause: (id: string) => void;
  onResume: (id: string) => void;
  loading?: boolean;
}

const STATUS_COLOR: Record<string, string> = {
  active: 'text-emerald-600',
  paused: 'text-amber-600',
  completed: 'text-gray-500',
  stopped: 'text-rose-600',
};

export function EnrollmentsTable({
  enrollments,
  onPause,
  onResume,
  loading,
}: EnrollmentsTableProps) {
  if (loading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-12 rounded-lg bg-gray-100 animate-pulse" />
        ))}
      </div>
    );
  }
  if (!enrollments.length) {
    return (
      <div className="py-8 text-center">
        <Text variant="muted">No enrollments yet.</Text>
        <Text variant="micro" className="mt-1 text-gray-400">
          Add contacts to this campaign to start the sequence.
        </Text>
      </div>
    );
  }

  const contactDisplay = (e: CampaignEnrollment) => {
    const c = e.contact;
    if (c?.name) return c.name;
    if (c?.email) return c.email;
    if (c?.phone) return c.phone;
    return '—';
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200">
            <th className="text-left py-2 px-3 font-semibold text-[#1e3a5f]">Contact</th>
            <th className="text-left py-2 px-3 font-semibold text-[#1e3a5f]">Status</th>
            <th className="text-left py-2 px-3 font-semibold text-[#1e3a5f]">Step</th>
            <th className="text-left py-2 px-3 font-semibold text-[#1e3a5f]">Next send</th>
            <th className="text-right py-2 px-3 font-semibold text-[#1e3a5f]">Actions</th>
          </tr>
        </thead>
        <tbody>
          {enrollments.map((e) => (
            <tr key={e.id} className="border-b border-gray-100 hover:bg-gray-50/50">
              <td className="py-2 px-3">{contactDisplay(e)}</td>
              <td className="py-2 px-3">
                <span className={STATUS_COLOR[e.status] ?? 'text-gray-500'}>
                  {e.status}
                </span>
              </td>
              <td className="py-2 px-3">{e.current_step}</td>
              <td className="py-2 px-3 text-gray-500">
                {e.next_send_at
                  ? new Date(e.next_send_at).toLocaleString()
                  : '—'}
              </td>
              <td className="py-2 px-3 text-right">
                {e.status === 'active' && (
                  <button
                    type="button"
                    onClick={() => onPause(e.id)}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded text-amber-600 hover:bg-amber-50 text-xs font-medium"
                  >
                    <Pause className="h-3.5 w-3.5" />
                    Pause
                  </button>
                )}
                {e.status === 'paused' && (
                  <button
                    type="button"
                    onClick={() => onResume(e.id)}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded text-emerald-600 hover:bg-emerald-50 text-xs font-medium"
                  >
                    <Play className="h-3.5 w-3.5" />
                    Resume
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
