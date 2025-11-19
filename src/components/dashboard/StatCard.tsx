import { LucideIcon } from 'lucide-react';
import { Card } from '../ui/Card';

interface StatCardProps {
  icon: LucideIcon;
  label: string;
  value: string | number;
  iconColor?: string;
  subtitle?: string;
}

export function StatCard({ icon: Icon, label, value, iconColor = 'rgb(0, 122, 255)', subtitle }: StatCardProps) {
  return (
    <Card padding="md" className="flex-1 min-w-[180px]">
      <div className="flex items-center justify-center mb-3">
        <div className="p-2 rounded-lg bg-gray-50">
          <Icon className="w-5 h-5" style={{ color: iconColor }} strokeWidth={2} />
        </div>
      </div>
      <div className="text-2xl font-semibold text-gray-900 mb-1 text-center">{value}</div>
      <div className="text-sm text-gray-500 text-center">{label}</div>
      {subtitle && <div className="text-xs text-gray-400 mt-1 text-center">{subtitle}</div>}
    </Card>
  );
}
