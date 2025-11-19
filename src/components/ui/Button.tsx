import { ReactNode, ButtonHTMLAttributes } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  variant?: 'primary' | 'secondary' | 'text';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  className = '',
  ...props
}: ButtonProps) {
  const variantClasses = {
    primary: 'hig-btn-primary',
    secondary: 'hig-btn-secondary',
    text: 'hig-btn-text',
  };

  const sizeClasses = {
    sm: 'text-sm px-3 py-1.5 min-h-[36px]',
    md: '',
    lg: 'text-base px-6 py-3 min-h-[48px]',
  };

  return (
    <button
      className={`${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
