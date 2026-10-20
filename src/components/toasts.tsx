import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { useI18n } from '../i18n';
import { Icon } from './icons';
import '../features/core/core.css';

interface Toast {
  id: number;
  text: string;
  action?: { label: string; run: () => void };
}

type Show = (text: string, action?: Toast['action']) => void;
const ToastContext = createContext<Show>(() => {});

/** Status messages are announced politely to screen readers; actionable toasts (undo) stay longer. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const [toasts, setToasts] = useState<Toast[]>([]);
  const next = useRef(1);
  const dismiss = useCallback((id: number) => setToasts((all) => all.filter((x) => x.id !== id)), []);
  const show = useCallback<Show>(
    (text, action) => {
      const id = next.current++;
      setToasts((all) => [...all.slice(-2), { id, text, action }]);
      setTimeout(() => dismiss(id), action ? 8000 : 3500);
    },
    [dismiss],
  );
  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((toast) => (
          <div key={toast.id} className="toast">
            <span className="grow">{toast.text}</span>
            {toast.action && (
              <button
                type="button"
                className="btn btn-s"
                onClick={() => {
                  toast.action?.run();
                  dismiss(toast.id);
                }}
              >
                {toast.action.label}
              </button>
            )}
            <button type="button" className="toast-x" aria-label={t('common.close')} title={t('common.close')} onClick={() => dismiss(toast.id)}>
              <Icon name="x" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): Show {
  return useContext(ToastContext);
}
