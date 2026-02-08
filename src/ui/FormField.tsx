import { ReactNode } from 'react';
import { Text } from './Text';

export type FormFieldProps = {
  label?: ReactNode;
  help?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  children: ReactNode;
  className?: string;
};

export function FormField({ label, help, error, required, children, className }: FormFieldProps) {
  return (
    <div className={['space-y-2', className].filter(Boolean).join(' ')}>
      {label && (
        <div className="flex items-center gap-2">
          {typeof label === 'string' ? (
            <Text as="label" variant="micro">
              {label}
            </Text>
          ) : (
            label
          )}
          {required && <Text as="span" variant="micro">*</Text>}
        </div>
      )}
      {children}
      {error ? (
        typeof error === 'string' ? (
          <Text variant="muted">{error}</Text>
        ) : (
          error
        )
      ) : help ? (
        typeof help === 'string' ? (
          <Text variant="muted">{help}</Text>
        ) : (
          help
        )
      ) : null}
    </div>
  );
}
