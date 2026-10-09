import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { AlertCircle, Check, Info, X } from 'lucide-react';
import { t as tr } from '@/i18n';

type Tone = 'info' | 'success' | 'error';

interface ToastOptions {
  tone?: Tone;
  action?: { label: string; onClick: () => void };
  duration?: number;
}

interface ToastItem extends ToastOptions {
  id: number;
  message: string;
  leaving: boolean;
}

interface ToastApi {
  toast: (message: string, options?: ToastOptions) => void;
}

const Ctx = createContext<ToastApi | null>(null);

const ICON: Record<Tone, ReactNode> = {
  info: <Info size={16} />,
  success: <Check size={16} />,
  error: <AlertCircle size={16} />,
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const counter = useRef(0);

  const dismiss = useCallback((id: number) => {
    setItems((prev) => prev.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
    window.setTimeout(() => setItems((prev) => prev.filter((t) => t.id !== id)), 160);
  }, []);

  const toast = useCallback(
    (message: string, options: ToastOptions = {}) => {
      const id = ++counter.current;
      // Keep at most three on screen.
      setItems((prev) => [...prev.slice(-2), { id, message, leaving: false, ...options }]);
      window.setTimeout(() => dismiss(id), options.duration ?? (options.action ? 6000 : 3200));
    },
    [dismiss],
  );

  const api = useMemo(() => ({ toast }), [toast]);

  return (
    <Ctx.Provider value={api}>
      {children}
      <div className="toasts" role="region" aria-label={tr('Notifications')} aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`toast ${t.tone ?? 'info'} ${t.leaving ? 'leaving' : ''}`} role={t.tone === 'error' ? 'alert' : 'status'}>
            <span className="toast-icon" aria-hidden="true">
              {ICON[t.tone ?? 'info']}
            </span>
            <span className="toast-msg">{t.message}</span>
            {t.action ? (
              <button
                type="button"
                className="toast-action"
                onClick={() => {
                  t.action?.onClick();
                  dismiss(t.id);
                }}
              >
                {t.action.label}
              </button>
            ) : null}
            <button type="button" className="toast-close" aria-label={tr('Dismiss')} onClick={() => dismiss(t.id)}>
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useToast must be used within ToastProvider.');
  return ctx;
}
