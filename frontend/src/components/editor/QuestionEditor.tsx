import { ChevronDown, Clock, Copy, Lightbulb, Trash2, Trophy } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, Card, Field, Select, Textarea } from "@/components/ui";
import { useAiAvailable } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { POINTS_MODES, type Question, type QuestionType, SCORED_TYPES, TIME_LIMITS } from "@/shared";
import { QuestionTypeGrid } from "./AddQuestionMenu";
import { AiImproveMenu } from "./AiImproveMenu";
import {
  ChoicesEditor,
  OrderEditor,
  SliderEditor,
  TrueFalseEditor,
  TypeAnswerEditor,
  WordCloudEditor,
} from "./AnswerEditors";
import { makeQuestion, type QuestionIssue } from "./defaults";
import { ImageField } from "./ImageField";
import { TYPE_COLORS, TypeIcon } from "./typeIcons";

function TypeSwitcher({ type, onChange }: { type: QuestionType; onChange: (t: QuestionType) => void }) {
  const { t } = useTranslation("editor");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t("question.changeType")}
        className="flex items-center gap-2 rounded-2xl border-2 border-border bg-surface py-1.5 pr-3 pl-1.5 font-semibold hover:border-pop-300"
      >
        <span
          className={cn(
            "grid size-8 place-items-center rounded-xl border-2 border-ink-900 text-white dark:border-black",
            TYPE_COLORS[type],
          )}
        >
          <TypeIcon type={type} className="size-4" />
        </span>
        {t(`common:questionTypes.${type}`)}
        <ChevronDown className="size-4 text-muted" />
      </button>
      <AnimatePresence>
        {open ? (
          <motion.div
            role="menu"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.12 }}
            className="absolute left-0 z-40 mt-2 w-[min(34rem,calc(100vw-2rem))] rounded-3xl border-2 border-ink-900 bg-surface p-2 shadow-pop dark:border-ink-600"
          >
            <QuestionTypeGrid
              current={type}
              onPick={(next) => {
                setOpen(false);
                if (next !== type) onChange(next);
              }}
            />
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

export function QuestionEditor({
  question,
  index,
  issues,
  showIssues,
  onChange,
  onReplace,
  onDuplicate,
  onDelete,
}: {
  question: Question;
  index: number;
  issues: QuestionIssue[];
  showIssues: boolean;
  onChange: (q: Question) => void;
  onReplace: (q: Question) => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation("editor");
  const aiAvailable = useAiAvailable();
  const patch = (p: Partial<Question>) => onChange({ ...question, ...p } as Question);
  const scored = SCORED_TYPES.has(question.type);

  const issueFor = (prefix: string) => issues.find((i) => i.path === prefix || i.path.startsWith(`${prefix}.`));
  const textIssue = showIssues && issueFor("text") ? t("validation.text") : undefined;
  const answerIssues = showIssues ? issues.filter((i) => i.path !== "text") : [];

  function answerMessage(issue: QuestionIssue): string {
    if (issue.path.startsWith("choices")) {
      if (/correct/i.test(issue.message)) return t("validation.correct");
      if (/>=|least|too_small|too small/i.test(issue.message) && !/\.text/.test(issue.path))
        return t("validation.minChoices");
      return t("validation.choiceText");
    }
    if (issue.path.startsWith("items")) return t("validation.items");
    if (issue.path.startsWith("acceptedAnswers")) return t("validation.accepted");
    if (/max must|correct must|range/i.test(issue.message)) return t("validation.slider");
    return issue.message;
  }

  let answers: ReactNode = null;
  switch (question.type) {
    case "quiz":
    case "multi":
    case "poll":
      answers = <ChoicesEditor question={question} onChange={patch as never} />;
      break;
    case "truefalse":
      answers = <TrueFalseEditor question={question} onChange={patch as never} />;
      break;
    case "type":
      answers = <TypeAnswerEditor question={question} onChange={patch as never} />;
      break;
    case "slider":
      answers = <SliderEditor question={question} onChange={patch as never} />;
      break;
    case "order":
      answers = <OrderEditor question={question} onChange={patch as never} />;
      break;
    case "wordcloud":
      answers = <WordCloudEditor question={question} onChange={patch as never} />;
      break;
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-display text-lg font-extrabold text-muted">{t("question.number", { n: index + 1 })}</span>
        <TypeSwitcher type={question.type} onChange={(type) => onReplace(makeQuestion(type, question))} />
        <div className="ml-auto flex items-center gap-1">
          {aiAvailable ? <AiImproveMenu question={question} onImproved={onReplace} /> : null}
          <Button
            size="icon"
            variant="ghost"
            onClick={onDuplicate}
            aria-label={t("list.duplicate")}
            title={t("list.duplicate")}
          >
            <Copy className="size-4" />
          </Button>
          <Button size="icon" variant="ghost" onClick={onDelete} aria-label={t("list.delete")} title={t("list.delete")}>
            <Trash2 className="size-4 text-[#e5383b]" />
          </Button>
        </div>
      </div>

      <Card className="space-y-5">
        <Field
          label={t("question.text")}
          htmlFor={`q-text-${question.id}`}
          error={textIssue}
          hint={<span className="tabular-nums">{question.text.length}/500</span>}
        >
          <Textarea
            id={`q-text-${question.id}`}
            value={question.text}
            maxLength={500}
            rows={2}
            placeholder={t("question.textPlaceholder")}
            onChange={(e) => patch({ text: e.target.value })}
            className="min-h-20 font-display text-xl font-bold sm:text-2xl"
          />
        </Field>

        <ImageField value={question.image} onChange={(image) => patch({ image })} />
      </Card>

      <Card className="space-y-4">
        <h3 className="text-lg font-bold">{t(`answers.${question.type}`)}</h3>
        {answers}
        {answerIssues.length > 0 ? (
          <ul className="space-y-1" role="alert">
            {[...new Set(answerIssues.map(answerMessage))].map((m) => (
              <li key={m} className="text-sm font-medium text-[#e5383b]">
                • {m}
              </li>
            ))}
          </ul>
        ) : null}
      </Card>

      <Card className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label={
              <span className="inline-flex items-center gap-1.5">
                <Clock className="size-4" /> {t("question.timeLimit")}
              </span>
            }
          >
            <Select value={question.timeLimit} onChange={(e) => patch({ timeLimit: Number(e.target.value) })}>
              {TIME_LIMITS.map((s) => (
                <option key={s} value={s}>
                  {t("common:seconds", { count: s })}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label={
              <span className="inline-flex items-center gap-1.5">
                <Trophy className="size-4" /> {t("question.points")}
              </span>
            }
            hint={!scored ? t("question.noPointsType") : undefined}
          >
            <Select
              value={scored ? question.points : "none"}
              disabled={!scored}
              onChange={(e) => patch({ points: e.target.value as Question["points"] })}
            >
              {POINTS_MODES.map((p) => (
                <option key={p} value={p}>
                  {t(`points.${p}`)}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field
          label={
            <span className="inline-flex items-center gap-1.5">
              <Lightbulb className="size-4" /> {t("question.explanation")}
            </span>
          }
          hint={t("question.explanationHint")}
        >
          <Textarea
            value={question.explanation ?? ""}
            maxLength={1000}
            rows={2}
            placeholder={t("question.explanationPlaceholder")}
            onChange={(e) => patch({ explanation: e.target.value || null })}
          />
        </Field>
      </Card>
    </div>
  );
}
