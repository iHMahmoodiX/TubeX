import { useId, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { useI18n } from '../i18n';

type Variant = 'default' | 'primary' | 'ghost' | 'danger';

export function Button({
  variant = 'default',
  size,
  block,
  className = '',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 's'; block?: boolean }) {
  const cls = ['btn', variant !== 'default' && `btn-${variant}`, size && `btn-${size}`, block && 'btn-block', className]
    .filter(Boolean)
    .join(' ');
  return <button type="button" className={cls} {...rest} />;
}

/** Labelled field. `children` receives the generated id and describedby ids. */
export function Field({
  label,
  help,
  counter,
  over,
  children,
}: {
  label: string;
  help?: string;
  counter?: string;
  over?: boolean;
  children: (ids: { id: string; describedBy?: string }) => ReactNode;
}) {
  const id = useId();
  const helpId = help ? `${id}-help` : undefined;
  const counterId = counter ? `${id}-counter` : undefined;
  const describedBy = [helpId, counterId].filter(Boolean).join(' ') || undefined;
  return (
    <div className="field">
      <div className="field-head">
        <label className="field-label" htmlFor={id}>
          {label}
        </label>
        {counter && (
          <span id={counterId} className="counter" data-over={over ? 'true' : 'false'}>
            {counter}
          </span>
        )}
      </div>
      {children({ id, describedBy })}
      {help && (
        <span id={helpId} className="field-help">
          {help}
        </span>
      )}
    </div>
  );
}

export function Notice({ tone = 'info', children }: { tone?: 'info' | 'warning' | 'error' | 'success'; children: ReactNode }) {
  const icon = { info: 'i', warning: '!', error: '×', success: '✓' }[tone];
  return (
    <div className={`notice notice-${tone}`} role={tone === 'error' ? 'alert' : undefined}>
      <span className="notice-icon" aria-hidden="true">
        {icon}
      </span>
      <div className="grow stack-s">{children}</div>
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="empty">{children}</p>;
}

/** Two-step inline confirmation for consequential actions; no modal dialog. */
export function ConfirmButton({
  label,
  question,
  confirmLabel,
  onConfirm,
  danger = true,
  size,
}: {
  label: string;
  question: string;
  confirmLabel: string;
  onConfirm: () => void | Promise<void>;
  danger?: boolean;
  size?: 's';
}) {
  const { t } = useI18n();
  const [asking, setAsking] = useState(false);
  if (!asking)
    return (
      <Button variant={danger ? 'danger' : 'default'} size={size} onClick={() => setAsking(true)}>
        {label}
      </Button>
    );
  return (
    <div className="notice notice-warning" role="group" aria-label={label}>
      <div className="grow stack-s">
        <p>{question}</p>
        <div className="row">
          <Button
            className={danger ? 'btn-danger-solid' : ''}
            variant={danger ? 'default' : 'primary'}
            size={size}
            autoFocus
            onClick={async () => {
              setAsking(false);
              await onConfirm();
            }}
          >
            {confirmLabel}
          </Button>
          <Button size={size} onClick={() => setAsking(false)}>
            {t('common.cancel')}
          </Button>
        </div>
      </div>
    </div>
  );
}
