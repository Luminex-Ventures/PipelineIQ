import { ElementType, HTMLAttributes } from 'react';
import { ui } from './tokens';

export type TextVariant = keyof typeof ui.text;

export type TextProps<T extends ElementType = 'p'> = {
  as?: T;
  variant?: TextVariant;
  className?: string;
} & Omit<HTMLAttributes<HTMLElement>, 'as' | 'className'>;

export function Text<T extends ElementType = 'p'>({
  as,
  variant = 'body',
  className,
  ...rest
}: TextProps<T>) {
  const Component = (as ?? 'p') as ElementType;
  const classes = [ui.text[variant], className].filter(Boolean).join(' ');
  return <Component className={classes} {...rest} />;
}
