import { LucideIcon } from 'lucide-react';
import { Card } from '../../ui/Card';
import { Text } from '../../ui/Text';
import { ui } from '../../ui/tokens';

interface StatCardProps {
  icon: LucideIcon;
  label: string;
  value: string | number;
  iconColor?: string;
  subtitle?: string;
}

export function StatCard({ icon: Icon, label, value, iconColor = 'rgb(0, 122, 255)', subtitle }: StatCardProps) {
  return (
    <Card padding="cardTight" className="flex-1 min-w-[180px]">
      <div className="flex items-center justify-center mb-3">
        <div className={[ui.pad.cardTight, ui.radius.control, 'bg-gray-50'].join(' ')}>
          <Icon className="w-5 h-5" style={{ color: iconColor }} strokeWidth={2} />
        </div>
      </div>
      <Text as="div" variant="h2" className={[ui.align.center, 'mb-1'].join(' ')}>
        {value}
      </Text>
      <Text as="div" variant="muted" className={ui.align.center}>
        {label}
      </Text>
      {subtitle && (
        <Text as="div" variant="muted" className={[ui.align.center, ui.tone.faint, 'mt-1'].join(' ')}>
          {subtitle}
        </Text>
      )}
    </Card>
  );
}
