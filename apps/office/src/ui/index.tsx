import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ReactNode,
  type TextareaHTMLAttributes,
} from 'react';
import { Link } from 'react-router';
import { Icon, type IconName } from './Icon';
import s from './ui.module.css';

export { Icon, type IconName } from './Icon';

const cx = (...names: (string | false | null | undefined)[]) => names.filter(Boolean).join(' ');

/* ---------- Button ---------- */

export function Button({
  variant = 'secondary',
  size = 'medium',
  icon,
  className,
  children,
  type = 'button',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'medium' | 'small';
  icon?: IconName;
}) {
  return (
    <button
      type={type}
      className={cx(s.button, variant === 'primary' && s.primary, variant === 'ghost' && s.ghost, variant === 'danger' && s.danger, size === 'small' && s.small, className)}
      {...rest}
    >
      {icon && <Icon name={icon} size={16} />}
      {children}
    </button>
  );
}

/** A link that looks like a button, for actions that go somewhere. Never a <button> inside an <a>. */
export function LinkButton({
  to,
  variant = 'secondary',
  size = 'medium',
  icon,
  children,
}: {
  to: string;
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'medium' | 'small';
  icon?: IconName;
  children: ReactNode;
}) {
  return (
    <Link to={to} className={cx(s.button, variant === 'primary' && s.primary, variant === 'ghost' && s.ghost, size === 'small' && s.small)}>
      {icon && <Icon name={icon} size={16} />}
      {children}
    </Link>
  );
}

export function IconButton({ icon, label, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { icon: IconName; label: string }) {
  return (
    <button type="button" className={s.iconButton} aria-label={label} title={label} {...rest}>
      <Icon name={icon} />
    </button>
  );
}

/* ---------- Badge ---------- */

export type Tone = 'neutral' | 'ok' | 'warn' | 'bad' | 'solid';

export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return <span className={cx(s.badge, s[tone])}>{children}</span>;
}

/* ---------- Panel ---------- */

export function Panel({
  title,
  subtitle,
  actions,
  children,
  className,
  bodyless = false,
  headingLevel = 2,
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Children render edge to edge (tables, lists) instead of inside padded body. */
  bodyless?: boolean;
  headingLevel?: 2 | 3;
}) {
  const id = useId();
  const Heading = `h${headingLevel}` as const;
  return (
    <section className={cx(s.panel, className)} aria-labelledby={title ? id : undefined}>
      {title && (
        <header className={s.panelHead}>
          <div>
            <Heading id={id} className={s.panelTitle}>
              {title}
            </Heading>
            {subtitle && <p className={s.panelSub}>{subtitle}</p>}
          </div>
          {actions}
        </header>
      )}
      {bodyless ? children : <div className={s.panelBody}>{children}</div>}
    </section>
  );
}

/* ---------- Meter ---------- */

export function Meter({ value, max, label }: { value: number; max: number; label: string }) {
  const ratio = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
  return (
    <span className={s.meter} role="meter" aria-valuemin={0} aria-valuemax={max} aria-valuenow={value} aria-label={label}>
      <span className={cx(s.meterFill, ratio === 1 && s.meterDone)} style={{ width: `${ratio * 100}%` }} />
    </span>
  );
}

/* ---------- Empty state ---------- */

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className={s.empty}>
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

/* ---------- Segmented control ---------- */

export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly { value: T; label: string; count?: number }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className={s.segmented} role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" className={s.segment} aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
          {o.count !== undefined && <span className={s.segmentCount}>{o.count}</span>}
        </button>
      ))}
    </div>
  );
}

/* ---------- Select ---------- */

export function Select<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <label className={s.selectField}>
      {label}
      <span className={s.selectWrap}>
        <select className={s.select} value={value} onChange={(e) => onChange(e.target.value as T)}>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <Icon name="chevronRight" size={14} className={s.selectChevron} />
      </span>
    </label>
  );
}

/* ---------- Text area ---------- */

export function TextArea({ label, hint, error, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; hint?: string; error?: string | null }) {
  const id = useId();
  return (
    <div className={s.field}>
      <label className={s.fieldLabel} htmlFor={id}>
        {label}
      </label>
      {hint && (
        <span className={s.fieldHint} id={`${id}-hint`}>
          {hint}
        </span>
      )}
      <textarea
        id={id}
        className={s.textarea}
        aria-invalid={error ? true : undefined}
        aria-describedby={cx(hint && `${id}-hint`, error && `${id}-error`) || undefined}
        {...rest}
      />
      {error && (
        <span className={s.fieldError} id={`${id}-error`} role="alert">
          {error}
        </span>
      )}
    </div>
  );
}

/* ---------- Dialog ---------- */

/**
 * A modal built on the native <dialog>: the browser traps focus, closes on Escape and makes the page
 * behind it inert. Focus returns to whatever opened it.
 */
export function Dialog({
  open,
  title,
  description,
  onClose,
  children,
  footer,
  className,
}: {
  open: boolean;
  title: string;
  description?: ReactNode;
  onClose: () => void;
  children?: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descId = useId();

  useEffect(() => {
    const el = ref.current;
    if (!el || !open) return;
    const opener = document.activeElement as HTMLElement | null;
    if (typeof el.showModal === 'function') el.showModal();
    else el.setAttribute('open', '');
    return () => {
      // Close first, so the page is no longer inert when focus goes back to the opener.
      if (typeof el.close === 'function' && el.open) el.close();
      else el.removeAttribute('open');
      opener?.focus?.();
    };
  }, [open]);

  return (
    // Keyboard users close with Escape (onCancel); the click handler only adds "click the backdrop to close".
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions
    <dialog
      ref={ref}
      className={cx(s.dialog, className)}
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        // A click on the backdrop lands on the <dialog> element itself.
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {open && (
        <>
          <header className={s.dialogHead}>
            <div>
              <h2 id={titleId} className={s.dialogTitle}>
                {title}
              </h2>
              {description && (
                <p id={descId} className={s.panelSub}>
                  {description}
                </p>
              )}
            </div>
            <IconButton icon="close" label="Close" onClick={onClose} />
          </header>
          {children && <div className={s.dialogBody}>{children}</div>}
          {footer && <footer className={s.dialogFoot}>{footer}</footer>}
        </>
      )}
    </dialog>
  );
}

/* ---------- Toasts ---------- */

interface ToastItem {
  id: number;
  message: string;
  tone: 'info' | 'error';
}

const ToastContext = createContext<((message: string, tone?: ToastItem['tone']) => void) | null>(null);

export function useToast() {
  const push = useContext(ToastContext);
  if (!push) throw new Error('useToast must be used inside <ToastProvider>');
  return push;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => setItems((list) => list.filter((t) => t.id !== id)), []);
  const push = useCallback(
    (message: string, tone: ToastItem['tone'] = 'info') => {
      const id = nextId.current++;
      setItems((list) => [...list.slice(-2), { id, message, tone }]);
      window.setTimeout(() => dismiss(id), tone === 'error' ? 8000 : 4000);
    },
    [dismiss],
  );
  const value = useMemo(() => push, [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className={s.toastRegion} role="status" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={cx(s.toast, t.tone === 'error' && s.toastError)}>
            <p>{t.message}</p>
            <button type="button" className={s.toastClose} aria-label="Dismiss" onClick={() => dismiss(t.id)}>
              <Icon name="close" size={16} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
