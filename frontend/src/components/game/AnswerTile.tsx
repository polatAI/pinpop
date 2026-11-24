import { Check, X } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { AnswerStyle } from "./answerStyles";

/**
 * A chunky, colourful answer button. Every tile shows its letter and icon so answers can be
 * told apart without colour.
 */
export function AnswerTile({
  style,
  label,
  selected,
  dimmed,
  result,
  size = "md",
  hideLabel,
  className,
  trailing,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  style: AnswerStyle;
  label?: ReactNode;
  selected?: boolean;
  dimmed?: boolean;
  /** Shows a ✓ or ✗ badge after the reveal. */
  result?: "correct" | "wrong" | null;
  size?: "md" | "lg" | "xl";
  hideLabel?: boolean;
  trailing?: ReactNode;
}) {
  const { Icon } = style;
  const interactive = !props.disabled && props.onClick;
  return (
    <button
      type="button"
      {...props}
      className={cn(
        "group relative flex w-full items-center gap-3 rounded-3xl border-2 border-ink-900 text-left font-bold text-white shadow-pop transition-all duration-150 dark:border-black",
        style.bg,
        size === "md" && "min-h-20 p-3 text-lg",
        // On phones the tiles sit in a narrow 2-column grid, so letter and text stack vertically.
        size === "lg" &&
          "min-h-24 flex-col justify-center p-3 text-center text-lg sm:flex-row sm:justify-start sm:p-4 sm:text-left sm:text-2xl",
        size === "xl" && "min-h-28 p-5 text-2xl lg:min-h-32 lg:text-4xl",
        hideLabel && "justify-center",
        interactive && "cursor-pointer hover:brightness-105 active:translate-y-[3px] active:shadow-none",
        !interactive && "cursor-default",
        selected && "ring-4 ring-ink-900 ring-offset-2 ring-offset-bg dark:ring-white",
        dimmed && "opacity-35 saturate-50",
        className,
      )}
    >
      <span
        className={cn(
          "grid shrink-0 place-items-center rounded-2xl bg-white/25 font-display font-extrabold",
          hideLabel
            ? "size-16 text-3xl"
            : size === "xl"
              ? "size-14 text-2xl lg:size-16 lg:text-3xl"
              : "size-12 text-xl",
        )}
        aria-hidden
      >
        {hideLabel ? <Icon className="size-9" /> : style.letter}
      </span>
      {hideLabel ? (
        <span className="sr-only">{style.letter}</span>
      ) : (
        <span
          className={cn(
            "min-w-0 break-words hyphens-auto [text-shadow:0_1px_2px_rgb(0_0_0/0.25)]",
            size === "lg" ? "w-full sm:w-auto sm:flex-1" : "flex-1",
          )}
        >
          {label}
        </span>
      )}
      {!hideLabel ? (
        <Icon className={cn("size-6 shrink-0 opacity-70", size === "lg" && "hidden sm:block")} aria-hidden />
      ) : null}
      {trailing}
      {result ? (
        <span
          className={cn(
            "absolute -top-3 -right-3 grid size-9 place-items-center rounded-full border-2 border-ink-900 dark:border-black",
            result === "correct" ? "bg-white text-[#0b7a59]" : "bg-ink-900 text-white",
          )}
        >
          {result === "correct" ? (
            <Check className="size-5" strokeWidth={3} />
          ) : (
            <X className="size-5" strokeWidth={3} />
          )}
        </span>
      ) : null}
    </button>
  );
}
