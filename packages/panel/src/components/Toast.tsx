import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { useI18n } from '../i18n';

const ToastContext = createContext<{ showError: (msg?: string) => void } | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const [msg, setMsg] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  const showError = useCallback(
    (m?: string) => {
      setMsg(m ?? t('toast.error.generic'));
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setMsg(null), 4000);
    },
    [t],
  );

  return (
    <ToastContext.Provider value={{ showError }}>
      {children}
      {msg && (
        <div className="toast" role="alert">
          {msg}
        </div>
      )}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
