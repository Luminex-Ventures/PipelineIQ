import { ReactNode } from 'react';
import { ui } from './tokens';

export type CardProps = {
  children: ReactNode;
  className?: string;
  padding?: 'card' | 'cardTight' | 'none';
} & React.HTMLAttributes<HTMLDivElement>;

export function Card({ children, className, padding = 'card', ...rest }: CardProps) {
  const paddingClass =
    padding === 'none' ? '' : padding === 'cardTight' ? ui.pad.cardTight : ui.pad.card;
  const classes = [
    ui.radius.card,
    ui.border.card,
    ui.shadow.card,
    paddingClass,
    'bg-white/90',
    className
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={classes} {...rest}>
      {children}
    </div>
  );
}
