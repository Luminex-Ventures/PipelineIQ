import { ui } from './tokens';
import { Text } from './Text';

export type LastUpdatedStatusProps = {
  refreshing: boolean;
  label?: string | null;
  className?: string;
};

export function LastUpdatedStatus({ refreshing, label, className }: LastUpdatedStatusProps) {
  if (!refreshing && !label) return null;

  return (
    <div className={['flex items-center gap-2', className].filter(Boolean).join(' ')}>
      {refreshing && (
        <span className={[ui.radius.pill, 'h-2 w-2 bg-[var(--app-accent)] animate-pulse'].join(' ')} />
      )}
      <Text as="span" variant="micro" className={ui.tone.subtle}>
        {refreshing ? 'Updating…' : label || ''}
      </Text>
    </div>
  );
}
