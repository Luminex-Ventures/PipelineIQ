import { ReactNode } from 'react';
import { Button } from '../ui/Button';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  children?: ReactNode;
}

export function PageHeader({ title, subtitle, action, children }: PageHeaderProps) {
  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="hig-text-display">{title}</h1>
          {subtitle && <p className="hig-text-caption mt-1">{subtitle}</p>}
        </div>
        {action && (
          <Button variant="primary" onClick={action.onClick}>
            {action.label}
          </Button>
        )}
      </div>
      {children}
    </div>
  );
}
