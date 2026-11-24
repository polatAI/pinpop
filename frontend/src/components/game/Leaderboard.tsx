import { ArrowDown, ArrowUp, Flame, Minus } from "lucide-react";
import { motion } from "motion/react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import type { LeaderboardEntry } from "@/shared";

function RankChange({ entry }: { entry: LeaderboardEntry }) {
  const { t } = useTranslation("game");
  if (entry.previousRank === null || entry.previousRank === entry.rank)
    return <Minus className="size-5 text-muted" aria-label={t("leaderboard.same")} />;
  const up = entry.rank < entry.previousRank;
  return up ? (
    <span className="inline-flex items-center text-sm font-bold text-[#12b886]" title={t("leaderboard.up")}>
      <ArrowUp className="size-5" strokeWidth={3} />
      {entry.previousRank - entry.rank}
    </span>
  ) : (
    <span className="inline-flex items-center text-sm font-bold text-pop-500" title={t("leaderboard.down")}>
      <ArrowDown className="size-5" strokeWidth={3} />
      {entry.rank - entry.previousRank}
    </span>
  );
}

const MEDALS = ["🥇", "🥈", "🥉"];

/** Animated ranking list; rows slide into their new positions. */
export function Leaderboard({
  entries,
  highlightId,
  size = "lg",
}: {
  entries: LeaderboardEntry[];
  highlightId?: string;
  size?: "md" | "lg";
}) {
  const { t, i18n } = useTranslation("game");
  const fmt = (n: number) => new Intl.NumberFormat(i18n.language).format(n);
  return (
    <ol className="flex w-full flex-col gap-2.5">
      {entries.map((e, i) => (
        <motion.li
          layout
          key={e.playerId}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 30, delay: i * 0.04 }}
          className={cn(
            "flex items-center gap-3 rounded-2xl border-2 bg-surface px-4",
            size === "lg" ? "py-3 text-xl" : "py-2 text-base",
            e.playerId === highlightId ? "border-pop-500 bg-pop-50 dark:bg-pop-900/30" : "border-border",
            i === 0 && "border-sun-400",
          )}
        >
          <span
            className={cn(
              "w-10 shrink-0 text-center font-display font-extrabold tabular-nums",
              size === "lg" ? "text-2xl" : "text-lg",
            )}
          >
            {MEDALS[e.rank - 1] ?? e.rank}
          </span>
          <span className={size === "lg" ? "text-3xl" : "text-2xl"} aria-hidden>
            {e.avatar}
          </span>
          <span className="min-w-0 flex-1 truncate font-bold">{e.nickname}</span>
          {e.streak >= 2 ? (
            <span
              className="inline-flex items-center gap-0.5 text-sm font-bold text-tang-500"
              title={t("leaderboard.streak", { count: e.streak })}
            >
              <Flame className="size-4" /> {e.streak}
            </span>
          ) : null}
          {e.lastPoints > 0 ? (
            <span className="hidden text-sm font-bold text-[#12b886] sm:inline">+{fmt(e.lastPoints)}</span>
          ) : null}
          <span className="w-24 text-right font-display font-extrabold tabular-nums">{fmt(e.score)}</span>
          <span className="w-10 shrink-0 text-right">
            <RankChange entry={e} />
          </span>
        </motion.li>
      ))}
    </ol>
  );
}
