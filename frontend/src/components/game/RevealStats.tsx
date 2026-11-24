import { Check, X } from "lucide-react";
import { motion } from "motion/react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import type { Question, RevealStats as Stats } from "@/shared";
import { answerStyle, FALSE_STYLE, TRUE_STYLE } from "./answerStyles";

/** Big-screen visualisation of how players answered, per question type. */
export function RevealStats({
  solution,
  stats,
  playerCount,
}: {
  solution: Question;
  stats: Stats;
  playerCount: number;
}) {
  const { t } = useTranslation("game");
  return (
    <div className="flex w-full flex-1 flex-col items-center justify-center gap-6">
      <Visual solution={solution} stats={stats} />
      <p className="text-lg font-semibold text-muted">
        {solution.type === "poll" || solution.type === "wordcloud"
          ? t("host.answeredOf", { count: stats.answeredCount, total: playerCount })
          : t("host.correctOf", { count: stats.correctCount, total: stats.answeredCount })}
      </p>
    </div>
  );
}

function Visual({ solution, stats }: { solution: Question; stats: Stats }) {
  switch (solution.type) {
    case "quiz":
    case "multi":
    case "poll":
      return (
        <Bars
          bars={solution.choices.map((c, i) => ({
            key: c.id,
            label: c.text,
            count: stats.counts?.[c.id] ?? 0,
            style: answerStyle(i),
            correct: solution.type === "poll" ? null : "correct" in c ? Boolean(c.correct) : null,
          }))}
        />
      );
    case "truefalse":
      return (
        <Bars
          bars={[true, false].map((v) => ({
            key: String(v),
            label: <TrueFalseLabel value={v} />,
            count: stats.counts?.[String(v)] ?? 0,
            style: v ? TRUE_STYLE : FALSE_STYLE,
            correct: solution.correct === v,
          }))}
        />
      );
    case "type":
    case "wordcloud":
      return (
        <WordCloud words={stats.words ?? []} accepted={solution.type === "type" ? solution.acceptedAnswers : null} />
      );
    case "slider":
      return <SliderPlot solution={solution} values={stats.values ?? []} />;
    case "order":
      return <OrderSolution solution={solution} />;
  }
}

function TrueFalseLabel({ value }: { value: boolean }) {
  const { t } = useTranslation("common");
  return <>{value ? t("true") : t("false")}</>;
}

function Bars({
  bars,
}: {
  bars: {
    key: string;
    label: React.ReactNode;
    count: number;
    style: ReturnType<typeof answerStyle>;
    correct: boolean | null;
  }[];
}) {
  const max = Math.max(1, ...bars.map((b) => b.count));
  return (
    <div className="flex w-full max-w-5xl flex-col gap-6">
      <div className="flex h-64 items-end justify-center gap-4 lg:h-80">
        {bars.map((b, i) => {
          const { Icon } = b.style;
          return (
            <div key={b.key} className="flex h-full w-full max-w-40 flex-col items-center justify-end gap-2">
              <span className="font-display text-3xl font-extrabold tabular-nums">{b.count}</span>
              <motion.div
                initial={{ height: 0 }}
                animate={{ height: `${Math.max(4, (b.count / max) * 100)}%` }}
                transition={{ duration: 0.7, delay: i * 0.08, ease: "easeOut" }}
                className={cn(
                  "relative w-full rounded-t-2xl border-2 border-b-0 border-ink-900 dark:border-black",
                  b.style.bg,
                  b.correct === false && "opacity-35",
                )}
              >
                <Icon className="absolute top-2 left-1/2 size-6 -translate-x-1/2 text-white/80" aria-hidden />
              </motion.div>
            </div>
          );
        })}
      </div>
      <div
        className={cn(
          "grid gap-3",
          bars.length <= 2 ? "grid-cols-2" : bars.length <= 4 ? "grid-cols-2 lg:grid-cols-4" : "grid-cols-3",
        )}
      >
        {bars.map((b) => (
          <div
            key={b.key}
            className={cn(
              "flex items-center gap-3 rounded-2xl border-2 border-ink-900 p-3 text-lg font-bold text-white dark:border-black",
              b.style.bg,
              b.correct === false && "opacity-40",
            )}
          >
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-white/25 font-display">
              {b.style.letter}
            </span>
            <span className="min-w-0 flex-1 break-words">{b.label}</span>
            {b.correct === true ? <Check className="size-7 shrink-0" strokeWidth={3} aria-label="correct" /> : null}
            {b.correct === false ? <X className="size-6 shrink-0 opacity-80" aria-label="wrong" /> : null}
          </div>
        ))}
      </div>
    </div>
  );
}

const CLOUD_COLORS = [
  "text-ans-a",
  "text-ans-b",
  "text-ans-c",
  "text-ans-d",
  "text-ans-e",
  "text-ans-f",
  "text-pop-500",
];

function WordCloud({ words, accepted }: { words: { text: string; count: number }[]; accepted: string[] | null }) {
  const { t } = useTranslation("game");
  if (words.length === 0) return <p className="text-2xl font-semibold text-muted">{t("host.noAnswers")}</p>;
  const max = Math.max(...words.map((w) => w.count));
  const norm = (s: string) => s.trim().toLocaleLowerCase();
  const acceptedSet = new Set((accepted ?? []).map(norm));
  return (
    <div className="flex w-full max-w-5xl flex-col items-center gap-6">
      {accepted ? (
        <div className="flex flex-wrap justify-center gap-2">
          {accepted.map((a) => (
            <span
              key={a}
              className="inline-flex items-center gap-1.5 rounded-full bg-[#12b886] px-4 py-1.5 text-lg font-bold text-white"
            >
              <Check className="size-5" strokeWidth={3} /> {a}
            </span>
          ))}
        </div>
      ) : null}
      <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-3 rounded-3xl border-2 border-border bg-surface p-8">
        {words.map((w, i) => {
          const scale = 0.4 + 0.6 * (w.count / max);
          const ok = acceptedSet.has(norm(w.text));
          return (
            <motion.span
              key={w.text}
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: Math.min(i * 0.03, 1) }}
              className={cn(
                "font-display leading-none font-extrabold",
                accepted
                  ? ok
                    ? "text-[#12b886]"
                    : "text-muted line-through decoration-2"
                  : CLOUD_COLORS[i % CLOUD_COLORS.length],
              )}
              style={{ fontSize: `${1 + scale * 3}rem` }}
              title={`${w.count}`}
            >
              {w.text}
            </motion.span>
          );
        })}
      </div>
    </div>
  );
}

function SliderPlot({ solution, values }: { solution: Extract<Question, { type: "slider" }>; values: number[] }) {
  const { i18n } = useTranslation();
  // Slider values are often years, so no thousands separators.
  const fmt = (n: number) =>
    new Intl.NumberFormat(i18n.language, { useGrouping: false, maximumFractionDigits: 2 }).format(n);
  const range = solution.max - solution.min || 1;
  const pct = (v: number) => ((v - solution.min) / range) * 100;
  const BUCKETS = 20;
  const buckets = Array.from({ length: BUCKETS }, () => 0);
  for (const v of values) buckets[Math.min(BUCKETS - 1, Math.floor(((v - solution.min) / range) * BUCKETS))]! += 1;
  const max = Math.max(1, ...buckets);
  const avg = values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
  return (
    <div className="w-full max-w-5xl">
      <div className="relative h-56 rounded-3xl border-2 border-border bg-surface px-6 pt-6">
        <div className="flex h-40 items-end gap-1">
          {buckets.map((n, i) => (
            <motion.div
              key={i}
              initial={{ height: 0 }}
              animate={{ height: `${(n / max) * 100}%` }}
              transition={{ duration: 0.6, delay: i * 0.02 }}
              className="flex-1 rounded-t-md bg-[#1f9bff]/70"
            />
          ))}
        </div>
        {solution.tolerance > 0 ? (
          <div
            className="absolute top-0 bottom-0 bg-[#12b886]/15"
            style={{
              left: `calc(1.5rem + (100% - 3rem) * ${Math.max(0, pct(solution.correct - solution.tolerance)) / 100})`,
              width: `calc((100% - 3rem) * ${(Math.min(100, pct(solution.correct + solution.tolerance)) - Math.max(0, pct(solution.correct - solution.tolerance))) / 100})`,
            }}
          />
        ) : null}
        <div
          className="absolute top-0 bottom-0 w-1 -translate-x-1/2 bg-[#12b886]"
          style={{ left: `calc(1.5rem + (100% - 3rem) * ${pct(solution.correct) / 100})` }}
        >
          <span className="absolute -top-1 left-1/2 -translate-x-1/2 -translate-y-full rounded-full bg-[#12b886] px-3 py-1 font-display text-xl font-extrabold whitespace-nowrap text-white">
            {fmt(solution.correct)}
            {solution.unit ? ` ${solution.unit}` : ""}
          </span>
        </div>
        <div className="mt-2 flex justify-between text-sm font-semibold text-muted tabular-nums">
          <span>{fmt(solution.min)}</span>
          <span>{fmt(solution.max)}</span>
        </div>
      </div>
      {avg !== null ? (
        <p className="mt-3 text-center text-lg text-muted">
          ⌀ {fmt(Math.round(avg * 100) / 100)}
          {solution.unit ? ` ${solution.unit}` : ""}
        </p>
      ) : null}
    </div>
  );
}

function OrderSolution({ solution }: { solution: Extract<Question, { type: "order" }> }) {
  return (
    <ol className="flex w-full max-w-3xl flex-col gap-3">
      {solution.items.map((item, i) => (
        <motion.li
          key={item.id}
          initial={{ opacity: 0, x: -30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: i * 0.12 }}
          className={cn(
            "flex items-center gap-4 rounded-2xl border-2 border-ink-900 p-3 text-2xl font-bold text-white shadow-pop-sm dark:border-black",
            answerStyle(i).bg,
          )}
        >
          <span className="grid size-11 place-items-center rounded-xl bg-white/25 font-display">{i + 1}</span>
          {item.text}
        </motion.li>
      ))}
    </ol>
  );
}
