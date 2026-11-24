import { cn } from "@/lib/utils";

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={cn("size-8", className)} aria-hidden>
      <defs>
        <linearGradient id="pinpop-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ff3d68" />
          <stop offset="1" stopColor="#ff8a3d" />
        </linearGradient>
      </defs>
      <path d="M32 4C19.3 4 9 14.1 9 26.6 9 43 32 60 32 60s23-17 23-33.4C55 14.1 44.7 4 32 4z" fill="url(#pinpop-g)" />
      <circle cx="32" cy="26" r="11" fill="#fff" />
      <circle cx="32" cy="26" r="5" fill="#14121f" />
    </svg>
  );
}

export function Logo({ className, size = "md" }: { className?: string; size?: "sm" | "md" | "lg" | "xl" }) {
  const text = { sm: "text-lg", md: "text-2xl", lg: "text-4xl", xl: "text-6xl" }[size];
  const mark = { sm: "size-6", md: "size-8", lg: "size-11", xl: "size-16" }[size];
  return (
    <span
      className={cn("inline-flex items-center gap-1.5 font-display font-extrabold tracking-tight", text, className)}
    >
      <LogoMark className={mark} />
      <span>
        pin<span className="text-pop-500">pop</span>
      </span>
    </span>
  );
}
