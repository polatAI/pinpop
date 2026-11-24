import { motion } from "motion/react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import type { LeaderboardEntry } from "@/shared";

const STEPS = [
  { place: 2, height: "h-40 lg:h-52", color: "bg-[#1f9bff]", delay: 0.6 },
  { place: 1, height: "h-56 lg:h-72", color: "bg-sun-400", delay: 1.4 },
  { place: 3, height: "h-28 lg:h-36", color: "bg-tang-500", delay: 0.2 },
];

/** Three-step podium; third place appears first, the winner last. */
export function Podium({ entries }: { entries: LeaderboardEntry[] }) {
  const { i18n } = useTranslation("game");
  const fmt = (n: number) => new Intl.NumberFormat(i18n.language).format(n);
  const byPlace = (place: number) => entries.find((e) => e.rank === place) ?? entries[place - 1];
  return (
    <div className="flex w-full max-w-4xl items-end justify-center gap-3 lg:gap-6">
      {STEPS.map((step) => {
        const e = byPlace(step.place);
        return (
          <div key={step.place} className="flex w-1/3 max-w-60 flex-col items-center">
            {e ? (
              <motion.div
                initial={{ opacity: 0, y: 30, scale: 0.6 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ delay: step.delay + 0.35, type: "spring", stiffness: 260, damping: 16 }}
                className="mb-3 flex flex-col items-center text-center"
              >
                <span
                  className={cn("leading-none", step.place === 1 ? "text-7xl lg:text-8xl" : "text-5xl lg:text-6xl")}
                  aria-hidden
                >
                  {e.avatar}
                </span>
                <span className="mt-2 max-w-full truncate text-lg font-bold lg:text-2xl">{e.nickname}</span>
                <span className="font-display text-xl font-extrabold text-muted tabular-nums">{fmt(e.score)}</span>
              </motion.div>
            ) : null}
            <motion.div
              initial={{ scaleY: 0 }}
              animate={{ scaleY: 1 }}
              style={{ originY: 1 }}
              transition={{ delay: step.delay, duration: 0.5, ease: "easeOut" }}
              className={cn(
                "grid w-full place-items-start justify-center rounded-t-3xl border-2 border-b-0 border-ink-900 pt-4 dark:border-black",
                step.height,
                step.color,
              )}
            >
              <span className="font-display text-5xl font-extrabold text-white [text-shadow:0_2px_0_rgb(0_0_0/0.25)] lg:text-7xl">
                {step.place}
              </span>
            </motion.div>
          </div>
        );
      })}
    </div>
  );
}
