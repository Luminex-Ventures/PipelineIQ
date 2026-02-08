import { ReactNode } from 'react';
import { Text } from './Text';
import { ui } from './tokens';

type PageHeaderProps = {
  label: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  className?: string;
};

export function PageHeader({ label, title, subtitle, className }: PageHeaderProps) {
  return (
    <div className={['space-y-2', className].filter(Boolean).join(' ')}>
      {typeof label === 'string' ? (
        <Text variant="micro">{label}</Text>
      ) : (
        <Text variant="micro" className={ui.tone.subtle}>
          {label}
        </Text>
      )}
      {typeof title === 'string' ? (
        <Text as="h1" variant="h1">
          {title}
        </Text>
      ) : (
        title
      )}
      {subtitle ? (
        typeof subtitle === 'string' ? (
          <Text variant="muted">{subtitle}</Text>
        ) : (
          subtitle
        )
      ) : null}
    </div>
  );
}
