import { Check, Copy, Play, Users } from "lucide-react";
import { type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { answerStyle, FALSE_STYLE, TRUE_STYLE } from "@/components/game/answerStyles";
import { Badge } from "@/components/ui";
import { cn, copyText, gradientFor } from "@/lib/utils";
import type { Question, QuizSummary } from "@/shared";

export function PageContainer({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("mx-auto w-full max-w-7xl px-4 py-8 sm:px-6", className)}>{children}</div>;
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-3xl font-extrabold sm:text-4xl">{title}</h1>
        {description ? <p className="mt-2 text-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

export function StatTile({
  label,
  value,
  icon,
  tone = "pop",
}: {
  label: ReactNode;
  value: ReactNode;
  icon?: ReactNode;
  tone?: "pop" | "sun" | "green" | "blue";
}) {
  const tones = {
    pop: "bg-pop-100 text-pop-700 dark:bg-pop-900/40 dark:text-pop-200",
    sun: "bg-sun-400/30 text-[#8a5a00] dark:text-sun-400",
    green: "bg-[#12b886]/15 text-[#0b7a59] dark:text-[#4fe0b0]",
    blue: "bg-[#1f9bff]/15 text-[#0b63a8] dark:text-[#7cc4ff]",
  };
  return (
    <div className="flex items-center gap-4 rounded-3xl border-2 border-border bg-surface p-5">
      {icon ? (
        <div className={cn("grid size-12 shrink-0 place-items-center rounded-2xl", tones[tone])}>{icon}</div>
      ) : null}
      <div className="min-w-0">
        <div className="text-sm font-semibold text-muted">{label}</div>
        <div className="truncate font-display text-2xl font-extrabold">{value}</div>
      </div>
    </div>
  );
}

export function CopyBox({ value, label, multiline }: { value: string; label?: ReactNode; multiline?: boolean }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-col gap-1.5">
      {label ? <div className="text-sm font-semibold">{label}</div> : null}
      <div className="relative">
        <pre
          className={cn(
            "overflow-x-auto rounded-2xl border-2 border-border bg-ink-900 py-3 pr-14 pl-4 font-mono text-[13px] text-white dark:bg-ink-950",
            multiline ? "whitespace-pre" : "whitespace-nowrap",
          )}
        >
          {value}
        </pre>
        <button
          type="button"
          onClick={async () => {
            await copyText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          className="absolute top-2 right-2 rounded-xl bg-white/10 p-2 text-white hover:bg-white/20"
          aria-label={t("actions.copy")}
          title={copied ? t("actions.copied") : t("actions.copy")}
        >
          {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
        </button>
      </div>
    </div>
  );
}

export function QuizCover({
  quiz,
  className,
  children,
}: {
  quiz: Pick<QuizSummary, "id" | "coverImage" | "title">;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div
      className={cn("relative overflow-hidden bg-gradient-to-br", !quiz.coverImage && gradientFor(quiz.id), className)}
    >
      {quiz.coverImage ? (
        <img src={quiz.coverImage} alt="" className="absolute inset-0 size-full object-cover" loading="lazy" />
      ) : (
        <div className="absolute inset-0 text-white/15 bg-dots" aria-hidden />
      )}
      {children}
    </div>
  );
}

export function QuizCard({ quiz, actions, to }: { quiz: QuizSummary; actions?: ReactNode; to: string }) {
  const { t } = useTranslation();
  return (
    <div className="group flex flex-col rounded-3xl border-2 border-border bg-surface transition-all hover:-translate-y-0.5 hover:border-ink-900 hover:shadow-pop dark:hover:border-ink-600">
      <Link to={to} className="block">
        <QuizCover quiz={quiz} className="aspect-[16/8] rounded-t-[1.6rem]">
          <div className="absolute top-3 left-3 flex gap-1.5">
            {quiz.visibility !== "private" ? (
              <Badge className="bg-white/90 text-ink-900">{t(`visibility.${quiz.visibility}`)}</Badge>
            ) : null}
          </div>
          <div className="absolute right-3 bottom-3 rounded-full bg-ink-900/80 px-2.5 py-1 text-xs font-bold text-white">
            {t("questions", { count: quiz.questionCount })}
          </div>
        </QuizCover>
      </Link>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <Link to={to} className="line-clamp-2 font-display text-lg leading-snug font-bold hover:text-pop-600">
          {quiz.title}
        </Link>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
          <span className="inline-flex items-center gap-1">
            <Play className="size-3.5" /> {t("plays", { count: quiz.playCount })}
          </span>
          {quiz.ownerName ? (
            <span className="inline-flex items-center gap-1 truncate">
              <Users className="size-3.5" /> {quiz.ownerName}
            </span>
          ) : null}
          <span className="uppercase">{quiz.language}</span>
        </div>
        {actions ? <div className="mt-auto flex flex-wrap gap-2 pt-2">{actions}</div> : null}
      </div>
    </div>
  );
}

/** Read-only rendering of a question, optionally revealing the answers. */
export function QuestionPreview({
  question,
  index,
  showAnswers,
}: {
  question: Question;
  index: number;
  showAnswers: boolean;
}) {
  const { t } = useTranslation();
  const q = question;
  return (
    <div className="rounded-3xl border-2 border-border bg-surface p-5">
      <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
        <span className="grid size-8 place-items-center rounded-xl bg-ink-900 font-bold text-white dark:bg-white dark:text-ink-900">
          {index + 1}
        </span>
        <Badge tone="pop">{t(`questionTypes.${q.type}`)}</Badge>
        <Badge>{t("seconds", { count: q.timeLimit })}</Badge>
        {q.points === "double" ? <Badge tone="sun">×2</Badge> : null}
      </div>
      <div className="flex gap-4">
        <p className="flex-1 font-display text-lg font-bold text-balance">{q.text}</p>
        {q.image ? (
          <img src={q.image} alt="" className="size-20 shrink-0 rounded-2xl object-cover" loading="lazy" />
        ) : null}
      </div>
      <div className="mt-4">
        {(q.type === "quiz" || q.type === "multi" || q.type === "poll") && (
          <div className="grid gap-2 sm:grid-cols-2">
            {q.choices.map((c, i) => {
              const s = answerStyle(i);
              const correct = "correct" in c && c.correct;
              return (
                <div
                  key={c.id}
                  className={cn(
                    "flex items-center gap-3 rounded-2xl border-2 px-3 py-2",
                    showAnswers && q.type !== "poll"
                      ? correct
                        ? "border-[#12b886] bg-[#12b886]/10"
                        : "border-border opacity-60"
                      : "border-border",
                  )}
                >
                  <span className={cn("grid size-7 shrink-0 place-items-center rounded-lg text-white", s.bg)}>
                    <s.Icon className="size-4" />
                  </span>
                  <span className="flex-1 font-medium">{c.text}</span>
                  {showAnswers && correct ? <Check className="size-5 text-[#12b886]" /> : null}
                </div>
              );
            })}
          </div>
        )}
        {q.type === "truefalse" && (
          <div className="grid grid-cols-2 gap-2">
            {[true, false].map((v) => {
              const s = v ? TRUE_STYLE : FALSE_STYLE;
              const correct = q.correct === v;
              return (
                <div
                  key={String(v)}
                  className={cn(
                    "flex items-center gap-3 rounded-2xl border-2 px-3 py-2",
                    showAnswers
                      ? correct
                        ? "border-[#12b886] bg-[#12b886]/10"
                        : "border-border opacity-60"
                      : "border-border",
                  )}
                >
                  <span className={cn("grid size-7 place-items-center rounded-lg text-white", s.bg)}>
                    <s.Icon className="size-4" />
                  </span>
                  <span className="flex-1 font-medium">{t(v ? "true" : "false")}</span>
                  {showAnswers && correct ? <Check className="size-5 text-[#12b886]" /> : null}
                </div>
              );
            })}
          </div>
        )}
        {showAnswers && q.type === "type" && (
          <div className="flex flex-wrap gap-2">
            {q.acceptedAnswers.map((a) => (
              <Badge key={a} tone="green" className="text-sm">
                {a}
              </Badge>
            ))}
          </div>
        )}
        {q.type === "slider" && (
          <div className="text-sm text-muted">
            {q.min} – {q.max} {q.unit ?? ""}
            {showAnswers ? (
              <span className="ml-3 font-bold text-[#0b7a59] dark:text-[#4fe0b0]">
                = {q.correct} {q.unit ?? ""} {q.tolerance ? `(±${q.tolerance})` : ""}
              </span>
            ) : null}
          </div>
        )}
        {q.type === "order" && (
          <ol className="flex flex-col gap-1.5">
            {(showAnswers ? q.items : [...q.items].sort((a, b) => a.text.localeCompare(b.text))).map((item, i) => (
              <li key={item.id} className="flex items-center gap-3 rounded-2xl border-2 border-border px-3 py-2">
                {showAnswers ? <span className="font-bold text-pop-600">{i + 1}.</span> : null}
                {item.text}
              </li>
            ))}
          </ol>
        )}
        {showAnswers && q.explanation ? (
          <p className="mt-3 rounded-2xl bg-surface-2 px-4 py-3 text-sm text-muted">💡 {q.explanation}</p>
        ) : null}
      </div>
    </div>
  );
}
