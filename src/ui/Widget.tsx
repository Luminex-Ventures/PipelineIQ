import { ReactNode } from 'react';
import { ui } from './tokens';

export type WidgetCardProps = {
  children: ReactNode;
  className?: string;
};

export function WidgetCard({ children, className }: WidgetCardProps) {
  const classes = [
    ui.radius.card,
    ui.border.card,
    ui.shadow.card,
    ui.padding.card,
    'bg-white/90',
    className
  ]
    .filter(Boolean)
    .join(' ');

  return <div className={classes}>{children}</div>;
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
    <div className={['flex items-center justify-between gap-3', className].filter(Boolean).join(' ')}>
      <div className="flex items-center gap-3">
        {icon && (
          <div className="h-8 w-8 rounded-xl bg-[var(--app-accent)]/10 text-[var(--app-accent)] flex items-center justify-center">
            {icon}
          </div>
        )}
        <div className="space-y-1">
          <div className="text-sm font-semibold text-gray-900">{title}</div>
          {subtitle && <div className="text-xs text-gray-500">{subtitle}</div>}
        </div>
      </div>
      {rightSlot && <div className="flex items-center">{rightSlot}</div>}
    </div>
  );
}
