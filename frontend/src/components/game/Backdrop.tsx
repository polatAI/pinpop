import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

const FLOATERS = [
  { e: "🎈", c: "top-[8%] left-[6%]", d: "0s" },
  { e: "⭐", c: "top-[18%] right-[8%]", d: "1.2s" },
  { e: "🍭", c: "bottom-[14%] left-[10%]", d: "2.1s" },
  { e: "⚡", c: "bottom-[22%] right-[12%]", d: "0.6s" },
  { e: "🎉", c: "top-[46%] left-[2%]", d: "3s" },
  { e: "🌈", c: "top-[60%] right-[3%]", d: "1.8s" },
];

/** Playful full-screen backdrop for game screens: dots, colour blobs and floating emoji. */
export function GameBackdrop({
  children,
  className,
  floaters = true,
  tone = "default",
}: {
  children: ReactNode;
  className?: string;
  floaters?: boolean;
  tone?: "default" | "dark";
}) {
  return (
    <div
      className={cn(
        "relative isolate min-h-dvh overflow-hidden",
        tone === "dark" ? "bg-ink-950 text-white" : "bg-bg text-fg",
        className,
      )}
      style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div
        aria-hidden
        className={cn(
          "bg-dots pointer-events-none absolute inset-0 -z-10",
          tone === "dark" ? "text-white/[0.06]" : "text-ink-900/[0.07] dark:text-white/[0.06]",
        )}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -top-32 -left-32 -z-10 size-96 rounded-full bg-pop-500/25 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-24 -bottom-40 -z-10 size-[28rem] rounded-full bg-sun-400/25 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute top-1/3 right-1/4 -z-10 size-72 rounded-full bg-[#1f9bff]/15 blur-3xl"
      />
      {floaters
        ? FLOATERS.map((f) => (
            <span
              key={f.e}
              aria-hidden
              className={cn(
                "pointer-events-none absolute -z-10 hidden animate-float text-4xl opacity-60 select-none sm:block",
                f.c,
              )}
              style={{ animationDelay: f.d }}
            >
              {f.e}
            </span>
          ))
        : null}
      {children}
    </div>
  );
}
