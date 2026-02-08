import { ReactNode } from 'react';
import { ui } from './tokens';
import { Text } from './Text';

export type PageShellProps = {
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  headerClassName?: string;
};

export function PageShell({ title, subtitle, actions, children, className, headerClassName }: PageShellProps) {
  return (
    <div className={[ui.pad.page, 'space-y-6', className].filter(Boolean).join(' ')}>
      {(title || subtitle || actions) && (
        <div className={['flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between', headerClassName].filter(Boolean).join(' ')}>
          <div className="space-y-2">
            {title && (
              typeof title === 'string' ? (
                <Text as="h1" variant="h1">
                  {title}
                </Text>
              ) : (
                title
              )
            )}
            {subtitle && (
              typeof subtitle === 'string' ? (
                <Text variant="muted">{subtitle}</Text>
              ) : (
                subtitle
              )
            )}
          </div>
          {actions && <div>{actions}</div>}
        </div>
      )}
      {children}
    </div>
  );
}
