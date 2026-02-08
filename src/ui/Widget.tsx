import { ReactNode } from 'react';
import { ui } from './tokens';
import { Card } from './Card';
import { Text } from './Text';

export type WidgetCardProps = {
  children: ReactNode;
  className?: string;
  style?: React.CSSProperties;
};

export function WidgetCard({ children, className, style }: WidgetCardProps) {
  return (
    <Card className={className} padding="card" style={style}>
      {children}
    </Card>
  );
}

export type WidgetHeaderProps = {
  icon?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  rightSlot?: ReactNode;
  className?: string;
};

export function WidgetHeader({ icon, title, subtitle, rightSlot, className }: WidgetHeaderProps) {
  return (
    <div
      className={[
        'flex items-center justify-between gap-3 w-full',
        ui.border.subtle,
        'border-t-0 border-l-0 border-r-0 pb-3 mb-3',
        className
      ].filter(Boolean).join(' ')}
    >
      <div className="flex items-center gap-3">
        {icon && (
          <div
            className={[
              'h-8 w-8 flex items-center justify-center',
              ui.radius.control,
              'bg-[var(--app-accent)]/10 text-[var(--app-accent)]'
            ].join(' ')}
          >
            {icon}
          </div>
        )}
        <div className="space-y-1">
          <Text as="div" variant="body" className="font-semibold">
            {title}
          </Text>
          {subtitle && (
            <Text as="div" variant="muted">
              {subtitle}
            </Text>
          )}
        </div>
      </div>
      {rightSlot && <div className="flex items-center">{rightSlot}</div>}
    </div>
  );
}
