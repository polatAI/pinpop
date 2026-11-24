import { Check, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import type { Question } from "@/shared";
import { answerStyle, FALSE_STYLE, TRUE_STYLE } from "./answerStyles";

/** Compact description of the correct answer, used on player devices after the reveal. */
export function SolutionSummary({ solution, className }: { solution: Question; className?: string }) {
  const { t, i18n } = useTranslation("game");
  // Slider values are often years, so no thousands separators.
  const fmt = (n: number) =>
    new Intl.NumberFormat(i18n.language, { useGrouping: false, maximumFractionDigits: 2 }).format(n);

  let body: React.ReactNode = null;
  switch (solution.type) {
    case "quiz":
    case "multi":
      body = (
        <ul className="flex flex-col gap-1.5">
          {solution.choices.map((c, i) =>
            c.correct ? (
              <li key={c.id} className="flex items-center gap-2 font-semibold">
                <span
                  className={cn(
                    "grid size-7 shrink-0 place-items-center rounded-lg text-sm text-white",
                    answerStyle(i).bg,
                  )}
                >
                  {answerStyle(i).letter}
                </span>
                {c.text}
              </li>
            ) : null,
          )}
        </ul>
      );
      break;
    case "truefalse": {
      const style = solution.correct ? TRUE_STYLE : FALSE_STYLE;
      const Icon = solution.correct ? Check : X;
      body = (
        <span className={cn("inline-flex items-center gap-2 rounded-xl px-3 py-1 font-bold text-white", style.bg)}>
          <Icon className="size-4" strokeWidth={3} /> {solution.correct ? t("common:true") : t("common:false")}
        </span>
      );
      break;
    }
    case "type":
      body = <span className="font-semibold">{solution.acceptedAnswers.join(" · ")}</span>;
      break;
    case "slider":
      body = (
        <span className="font-display text-2xl font-extrabold">
          {fmt(solution.correct)}
          {solution.unit ? ` ${solution.unit}` : ""}
          {solution.tolerance > 0 ? (
            <span className="ml-2 text-base text-muted">± {fmt(solution.tolerance)}</span>
          ) : null}
        </span>
      );
      break;
    case "order":
      body = (
        <ol className="flex flex-col gap-1">
          {solution.items.map((item, i) => (
            <li key={item.id} className="font-semibold">
              {i + 1}. {item.text}
            </li>
          ))}
        </ol>
      );
      break;
    default:
      return null;
  }

  return (
    <div className={cn("rounded-2xl border-2 border-border bg-surface p-4 text-left", className)}>
      <p className="mb-2 text-xs font-bold tracking-wide text-muted uppercase">{t("play.correctAnswer")}</p>
      {body}
    </div>
  );
}
