import { Loader2, X } from "lucide-react";
import {
  type ButtonHTMLAttributes,
  forwardRef,
  type HTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
  useEffect,
  useId,
  useRef,
} from "react";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------- Button

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "dark" | "sun";
type ButtonSize = "sm" | "md" | "lg" | "xl" | "icon";

const variants: Record<ButtonVariant, string> = {
  primary: "bg-pop-500 text-white border-2 border-ink-900 shadow-pop hover:bg-pop-600 dark:border-black",
  secondary:
    "bg-surface text-fg border-2 border-ink-900 shadow-pop hover:bg-surface-2 dark:border-ink-600 dark:shadow-none",
  ghost: "bg-transparent text-fg hover:bg-surface-2 border-2 border-transparent",
  danger: "bg-[#e5383b] text-white border-2 border-ink-900 shadow-pop hover:bg-[#c92a2d] dark:border-black",
  dark: "bg-ink-900 text-white border-2 border-ink-900 shadow-pop hover:bg-ink-800 dark:bg-white dark:text-ink-900 dark:border-white",
  sun: "bg-sun-400 text-ink-900 border-2 border-ink-900 shadow-pop hover:bg-sun-500 dark:border-black",
};

const sizes: Record<ButtonSize, string> = {
  sm: "h-9 px-3 text-sm rounded-xl gap-1.5",
  md: "h-11 px-4 text-[15px] rounded-2xl gap-2",
  lg: "h-13 px-6 text-base rounded-2xl gap-2",
  xl: "h-16 px-8 text-xl rounded-3xl gap-3",
  icon: "h-10 w-10 rounded-xl",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", loading, disabled, className, children, type = "button", ...props },
  ref,
) {
  const pressable = variant !== "ghost";
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={cn(
        "inline-flex shrink-0 select-none items-center justify-center font-semibold whitespace-nowrap transition-all duration-100",
        "disabled:cursor-not-allowed disabled:opacity-50",
        pressable && "active:translate-y-[3px] active:shadow-none disabled:active:translate-y-0",
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    >
      {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
      {children}
    </button>
  );
});

// ---------------------------------------------------------------- Form controls

const fieldBase =
  "w-full rounded-2xl border-2 border-border bg-surface px-4 text-fg placeholder:text-muted/70 transition-colors focus:border-pop-500 focus:outline-none disabled:opacity-60";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...props },
  ref,
) {
  return <input ref={ref} className={cn(fieldBase, "h-11", className)} {...props} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea(
  { className, ...props },
  ref,
) {
  return <textarea ref={ref} className={cn(fieldBase, "min-h-24 py-3 leading-relaxed", className)} {...props} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select(
  { className, children, ...props },
  ref,
) {
  return (
    <select
      ref={ref}
      className={cn(fieldBase, "h-11 cursor-pointer appearance-none bg-no-repeat pr-10", className)}
      style={{
        backgroundImage:
          "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' fill='none' stroke='%236d6680' stroke-width='2'%3E%3Cpath d='m4 6 4 4 4-4'/%3E%3C/svg%3E\")",
        backgroundPosition: "right 0.9rem center",
      }}
      {...props}
    >
      {children}
    </select>
  );
});

export function Field({
  label,
  hint,
  error,
  children,
  className,
  htmlFor,
}: {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  children: ReactNode;
  className?: string;
  htmlFor?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {label ? (
        <label htmlFor={htmlFor} className="text-sm font-semibold">
          {label}
        </label>
      ) : null}
      {children}
      {error ? (
        <p className="text-sm font-medium text-[#e5383b]" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-sm text-muted">{hint}</p>
      ) : null}
    </div>
  );
}

export function Switch({
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-4 py-1">
      <div className="min-w-0">
        <label htmlFor={id} className="cursor-pointer font-semibold">
          {label}
        </label>
        {description ? <p className="text-sm text-muted">{description}</p> : null}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative mt-0.5 h-7 w-12 shrink-0 rounded-full border-2 border-ink-900 transition-colors disabled:opacity-50 dark:border-ink-600",
          checked ? "bg-pop-500" : "bg-surface-2",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 left-0.5 size-5 rounded-full border-2 border-ink-900 bg-white transition-transform dark:border-ink-600",
            checked && "translate-x-5",
          )}
        />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------- Surfaces

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("rounded-3xl border-2 border-border bg-surface p-5 shadow-soft sm:p-6", className)} {...props} />
  );
}

export function Badge({
  className,
  tone = "neutral",
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: "neutral" | "pop" | "sun" | "green" | "blue" }) {
  const tones = {
    neutral: "bg-surface-2 text-fg",
    pop: "bg-pop-100 text-pop-700 dark:bg-pop-900/40 dark:text-pop-200",
    sun: "bg-sun-400/30 text-[#8a5a00] dark:text-sun-400",
    green: "bg-[#12b886]/15 text-[#0b7a59] dark:text-[#4fe0b0]",
    blue: "bg-[#1f9bff]/15 text-[#0b63a8] dark:text-[#7cc4ff]",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold",
        tones[tone],
        className,
      )}
      {...props}
    />
  );
}

export function Spinner({ className, label }: { className?: string; label?: string }) {
  return (
    <div className={cn("flex items-center justify-center gap-3 p-8 text-muted", className)} role="status">
      <Loader2 className="size-6 animate-spin" aria-hidden />
      {label ? <span>{label}</span> : <span className="sr-only">Loading</span>}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-3xl border-2 border-dashed border-border px-6 py-14 text-center">
      {icon ? <div className="text-4xl">{icon}</div> : null}
      <h3 className="text-xl font-bold">{title}</h3>
      {description ? <p className="max-w-md text-muted">{description}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

// ---------------------------------------------------------------- Dialog

export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);
  const widths = { sm: "max-w-sm", md: "max-w-lg", lg: "max-w-2xl", xl: "max-w-4xl" };
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className={cn(
        "m-auto w-[calc(100%-2rem)] rounded-3xl border-2 border-ink-900 bg-surface p-0 text-fg shadow-pop backdrop:bg-ink-950/60 backdrop:backdrop-blur-sm dark:border-ink-600",
        widths[size],
      )}
    >
      {open ? (
        <div className="flex max-h-[85dvh] flex-col">
          <div className="flex items-start justify-between gap-4 border-b-2 border-border px-6 py-4">
            <div>
              <h2 className="text-xl font-bold">{title}</h2>
              {description ? <p className="mt-1 text-sm text-muted">{description}</p> : null}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="-mr-2 rounded-xl p-2 text-muted hover:bg-surface-2 hover:text-fg"
              aria-label="Close"
            >
              <X className="size-5" />
            </button>
          </div>
          <div className="overflow-y-auto px-6 py-5">{children}</div>
          {footer ? <div className="flex justify-end gap-3 border-t-2 border-border px-6 py-4">{footer}</div> : null}
        </div>
      ) : null}
    </dialog>
  );
}

// ---------------------------------------------------------------- Tabs

export function Tabs<T extends string>({
  value,
  onChange,
  items,
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  items: { value: T; label: ReactNode; icon?: ReactNode }[];
  className?: string;
}) {
  return (
    <div role="tablist" className={cn("inline-flex flex-wrap gap-1 rounded-2xl bg-surface-2 p-1", className)}>
      {items.map((item) => (
        <button
          key={item.value}
          type="button"
          role="tab"
          aria-selected={value === item.value}
          onClick={() => onChange(item.value)}
          className={cn(
            "inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-semibold transition-colors",
            value === item.value ? "bg-surface text-fg shadow-sm" : "text-muted hover:text-fg",
          )}
        >
          {item.icon}
          {item.label}
        </button>
      ))}
    </div>
  );
}
