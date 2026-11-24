import { cn } from "@/lib/utils";

/** Circular countdown ring. */
export function CountdownRing({
  remainingMs,
  totalMs,
  size = 96,
  className,
}: {
  remainingMs: number;
  totalMs: number;
  size?: number;
  className?: string;
}) {
  const seconds = Math.ceil(remainingMs / 1000);
  const fraction = totalMs > 0 ? Math.min(1, Math.max(0, remainingMs / totalMs)) : 0;
  const stroke = Math.max(6, size / 11);
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const urgent = seconds <= 5;
  return (
    <div
      className={cn("relative grid shrink-0 place-items-center", className)}
      style={{ width: size, height: size }}
      role="timer"
      aria-live="off"
      aria-label={`${seconds}`}
    >
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="stroke-surface-2" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - fraction)}
          className={cn(
            "transition-[stroke-dashoffset] duration-100 ease-linear",
            urgent ? "stroke-pop-500" : "stroke-sun-400",
          )}
        />
      </svg>
      <span
        className={cn(
          "absolute font-display font-extrabold tabular-nums",
          urgent && seconds > 0 && "animate-wiggle text-pop-500",
        )}
        style={{ fontSize: size * 0.36 }}
      >
        {seconds}
      </span>
    </div>
  );
}

/** Thin horizontal progress bar that drains as time passes. */
export function TimeBar({
  remainingMs,
  totalMs,
  className,
}: {
  remainingMs: number;
  totalMs: number;
  className?: string;
}) {
  const fraction = totalMs > 0 ? Math.min(1, Math.max(0, remainingMs / totalMs)) : 0;
  return (
    <div
      className={cn(
        "h-3 w-full overflow-hidden rounded-full border-2 border-ink-900 bg-surface dark:border-ink-600",
        className,
      )}
    >
      <div
        className="h-full rounded-full bg-gradient-to-r from-pop-500 to-sun-400 transition-[width] duration-100 ease-linear"
        style={{ width: `${fraction * 100}%` }}
      />
    </div>
  );
}
