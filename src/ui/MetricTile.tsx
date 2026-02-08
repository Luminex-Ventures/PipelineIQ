import { ReactNode } from 'react';
import { Text } from './Text';
import { ui } from './tokens';

type MetricTileProps = {
  label: string;
  value: ReactNode;
  sublabel?: ReactNode;
  icon?: ReactNode;
  rightSlot?: ReactNode;
  footer?: ReactNode;
  valueClassName?: string;
  className?: string;
  showBorder?: boolean;
  title?: string;
};

export function MetricTile({
  label,
  value,
  sublabel,
  icon,
  rightSlot,
  footer,
  valueClassName,
  className,
  showBorder = true,
  title
}: MetricTileProps) {
  const classes = [
    ui.radius.card,
    ui.shadow.card,
    ui.pad.cardTight,
    'bg-white/90',
    showBorder ? ui.border.card : 'border border-transparent',
    className
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={classes} title={title}>
      <div className="space-y-2">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            {icon && (
              <span className="flex h-7 w-7 items-center justify-center">
                {icon}
              </span>
            )}
            <Text as="div" variant="micro" className="font-semibold text-gray-700 truncate">
              {label}
            </Text>
          </div>
          {rightSlot && <div className="flex-shrink-0">{rightSlot}</div>}
        </div>
        <Text as="div" variant="h2" className={valueClassName}>
          {value}
        </Text>
        {sublabel && (
          <Text as="div" variant="muted">
            {sublabel}
          </Text>
        )}
        {footer && (
          <div className="space-y-1">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
