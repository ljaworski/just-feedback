import { useState } from 'react';
import { useI18n } from '../i18n';

export function CopyButton({ value, className }: { value: string; className?: string }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className={className ?? 'btn-secondary'}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
        } catch {
          /* clipboard may be blocked; ignore */
        }
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? t('action.copied') : t('action.copy')}
    </button>
  );
}
