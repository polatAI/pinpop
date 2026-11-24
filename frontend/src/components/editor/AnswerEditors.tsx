import { ArrowDown, ArrowUp, Check, Plus, Trash2, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { answerStyle, FALSE_STYLE, TRUE_STYLE } from "@/components/game/answerStyles";
import { Button, Field, Input } from "@/components/ui";
import { cn } from "@/lib/utils";
import type { Question } from "@/shared";
import { shortId } from "@/shared";
import { ChipsInput } from "./ChipsInput";
import { type Draft, newChoice } from "./defaults";

type Update<Q extends Question> = (patch: Partial<Q>) => void;

// ---------------------------------------------------------------- choices (quiz, multi, poll)

export function ChoicesEditor({
  question,
  onChange,
}: {
  question: Draft<"quiz"> | Draft<"multi"> | Draft<"poll">;
  onChange: Update<Draft<"quiz"> | Draft<"multi"> | Draft<"poll">>;
}) {
  const { t } = useTranslation("editor");
  const choices = question.choices as { id: string; text: string; correct?: boolean }[];
  const hasCorrect = question.type !== "poll";
  const single = question.type === "quiz";

  const set = (next: typeof choices) => onChange({ choices: next } as never);

  function toggleCorrect(id: string) {
    set(
      choices.map((c) => (single ? { ...c, correct: c.id === id } : c.id === id ? { ...c, correct: !c.correct } : c)),
    );
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        {choices.map((c, i) => {
          const style = answerStyle(i);
          const Icon = style.Icon;
          const correct = Boolean(c.correct);
          return (
            <div
              key={c.id}
              className={cn(
                "flex items-center gap-2 rounded-2xl border-2 border-ink-900 p-2 text-white shadow-pop-sm transition-all dark:border-black",
                style.bg,
                hasCorrect && !correct && "opacity-90",
              )}
            >
              <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-white/25 font-display font-extrabold">
                <Icon className="size-4" />
                <span className="sr-only">{style.letter}</span>
              </span>
              <input
                value={c.text}
                maxLength={120}
                onChange={(e) => set(choices.map((x) => (x.id === c.id ? { ...x, text: e.target.value } : x)))}
                placeholder={t("choices.placeholder", { letter: style.letter })}
                aria-label={t("choices.label", { letter: style.letter })}
                className="min-w-0 flex-1 rounded-xl bg-white/95 px-3 py-2 font-semibold text-ink-900 placeholder:text-ink-900/40 focus:outline-2 focus:outline-white"
              />
              {hasCorrect ? (
                <button
                  type="button"
                  aria-pressed={correct}
                  onClick={() => toggleCorrect(c.id)}
                  title={correct ? t("choices.correct") : t("choices.markCorrect")}
                  aria-label={t("choices.markCorrectN", { letter: style.letter })}
                  className={cn(
                    "grid size-9 shrink-0 place-items-center border-2 border-white transition-colors",
                    single ? "rounded-full" : "rounded-xl",
                    correct ? "bg-white text-[#0b7a59]" : "bg-white/10 text-transparent hover:bg-white/25",
                  )}
                >
                  <Check className="size-5" strokeWidth={3} />
                </button>
              ) : null}
              {choices.length > 2 ? (
                <button
                  type="button"
                  onClick={() => set(choices.filter((x) => x.id !== c.id))}
                  aria-label={t("choices.remove", { letter: style.letter })}
                  className="grid size-8 shrink-0 place-items-center rounded-xl text-white/80 hover:bg-white/20 hover:text-white"
                >
                  <X className="size-4" />
                </button>
              ) : null}
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        {choices.length < 6 ? (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => set([...choices, question.type === "poll" ? { id: shortId(6), text: "" } : newChoice()])}
          >
            <Plus className="size-4" /> {t("choices.add")}
          </Button>
        ) : (
          <span />
        )}
        {hasCorrect ? (
          <p className="text-sm text-muted">{single ? t("choices.singleHint") : t("choices.multiHint")}</p>
        ) : (
          <p className="text-sm text-muted">{t("choices.pollHint")}</p>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- true / false

export function TrueFalseEditor({
  question,
  onChange,
}: {
  question: Draft<"truefalse">;
  onChange: Update<Draft<"truefalse">>;
}) {
  const { t } = useTranslation("editor");
  const options = [
    { value: true, label: t("common:true"), style: TRUE_STYLE, Icon: Check },
    { value: false, label: t("common:false"), style: FALSE_STYLE, Icon: X },
  ];
  return (
    <div className="space-y-2">
      <fieldset className="grid grid-cols-2 gap-3" aria-label={t("truefalse.label")}>
        {options.map((o) => {
          const active = question.correct === o.value;
          return (
            <button
              key={String(o.value)}
              type="button"
              aria-pressed={active}
              onClick={() => onChange({ correct: o.value })}
              className={cn(
                "flex h-24 flex-col items-center justify-center gap-1 rounded-3xl border-2 border-ink-900 font-display text-xl font-extrabold text-white transition-all dark:border-black",
                o.style.bg,
                active ? "shadow-pop ring-4 ring-pop-200 dark:ring-pop-800" : "opacity-45 hover:opacity-70",
              )}
            >
              <o.Icon className="size-7" strokeWidth={3} />
              {o.label}
            </button>
          );
        })}
      </fieldset>
      <p className="text-sm text-muted">{t("truefalse.hint")}</p>
    </div>
  );
}

// ---------------------------------------------------------------- type answer

export function TypeAnswerEditor({ question, onChange }: { question: Draft<"type">; onChange: Update<Draft<"type">> }) {
  const { t } = useTranslation("editor");
  return (
    <Field label={t("type.label")} hint={t("type.hint")} htmlFor={`accepted-${question.id}`}>
      <ChipsInput
        id={`accepted-${question.id}`}
        value={question.acceptedAnswers}
        onChange={(acceptedAnswers) => onChange({ acceptedAnswers })}
        max={10}
        maxLength={80}
        label={t("type.label")}
        placeholder={t("type.placeholder")}
      />
    </Field>
  );
}

// ---------------------------------------------------------------- slider

function NumberInput({
  label,
  value,
  onChange,
  step,
  min,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
}) {
  return (
    <Field label={label}>
      <Input
        type="number"
        inputMode="decimal"
        value={Number.isFinite(value) ? value : ""}
        step={step ?? "any"}
        min={min}
        onChange={(e) => {
          const v = e.target.valueAsNumber;
          onChange(Number.isNaN(v) ? 0 : v);
        }}
      />
    </Field>
  );
}

export function SliderEditor({ question, onChange }: { question: Draft<"slider">; onChange: Update<Draft<"slider">> }) {
  const { t } = useTranslation("editor");
  const { min, max, step, correct, tolerance } = question;
  const range = max - min;
  const pct = (v: number) => (range > 0 ? Math.min(100, Math.max(0, ((v - min) / range) * 100)) : 0);
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <NumberInput label={t("slider.min")} value={min} onChange={(v) => onChange({ min: v })} />
        <NumberInput label={t("slider.max")} value={max} onChange={(v) => onChange({ max: v })} />
        <NumberInput label={t("slider.step")} value={step} min={0} onChange={(v) => onChange({ step: v })} />
        <NumberInput label={t("slider.correct")} value={correct} onChange={(v) => onChange({ correct: v })} />
        <NumberInput
          label={t("slider.tolerance")}
          value={tolerance}
          min={0}
          onChange={(v) => onChange({ tolerance: Math.max(0, v) })}
        />
        <Field label={t("slider.unit")}>
          <Input
            value={question.unit ?? ""}
            maxLength={16}
            placeholder={t("slider.unitPlaceholder")}
            onChange={(e) => onChange({ unit: e.target.value || null })}
          />
        </Field>
      </div>
      <div className="rounded-2xl border-2 border-border bg-surface-2 p-4">
        <p className="mb-3 text-xs font-semibold tracking-wide text-muted uppercase">{t("slider.preview")}</p>
        <div className="relative h-3 rounded-full bg-border">
          {range > 0 ? (
            <>
              <div
                className="absolute inset-y-0 rounded-full bg-ans-d/40"
                style={{ left: `${pct(correct - tolerance)}%`, right: `${100 - pct(correct + tolerance)}%` }}
              />
              <div
                className="absolute top-1/2 size-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-ink-900 bg-ans-d shadow-pop-sm dark:border-black"
                style={{ left: `${pct(correct)}%` }}
              />
            </>
          ) : null}
        </div>
        <div className="mt-3 flex justify-between text-sm font-semibold text-muted">
          <span>
            {min} {question.unit}
          </span>
          <span className="text-fg">
            {t("slider.answerIs", { value: correct, unit: question.unit ?? "" })}
            {tolerance > 0 ? ` (±${tolerance})` : ""}
          </span>
          <span>
            {max} {question.unit}
          </span>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- order

export function OrderEditor({ question, onChange }: { question: Draft<"order">; onChange: Update<Draft<"order">> }) {
  const { t } = useTranslation("editor");
  const items = question.items;
  const set = (next: typeof items) => onChange({ items: next });
  const move = (from: number, to: number) => {
    if (to < 0 || to >= items.length) return;
    const next = [...items];
    const [it] = next.splice(from, 1);
    if (it) next.splice(to, 0, it);
    set(next);
  };
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">{t("order.hint")}</p>
      <ol className="space-y-2">
        {items.map((item, i) => (
          <li key={item.id} className="flex items-center gap-2">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl border-2 border-ink-900 bg-tang-500 font-display font-extrabold text-white dark:border-black">
              {i + 1}
            </span>
            <Input
              value={item.text}
              maxLength={120}
              aria-label={t("order.itemN", { n: i + 1 })}
              placeholder={t("order.placeholder", { n: i + 1 })}
              onChange={(e) => set(items.map((x) => (x.id === item.id ? { ...x, text: e.target.value } : x)))}
            />
            <div className="flex shrink-0">
              <button
                type="button"
                disabled={i === 0}
                onClick={() => move(i, i - 1)}
                aria-label={t("order.up")}
                className="rounded-lg p-2 text-muted hover:bg-surface-2 hover:text-fg disabled:opacity-30"
              >
                <ArrowUp className="size-4" />
              </button>
              <button
                type="button"
                disabled={i === items.length - 1}
                onClick={() => move(i, i + 1)}
                aria-label={t("order.down")}
                className="rounded-lg p-2 text-muted hover:bg-surface-2 hover:text-fg disabled:opacity-30"
              >
                <ArrowDown className="size-4" />
              </button>
              <button
                type="button"
                disabled={items.length <= 2}
                onClick={() => set(items.filter((x) => x.id !== item.id))}
                aria-label={t("order.remove")}
                className="rounded-lg p-2 text-muted hover:bg-[#e5383b]/10 hover:text-[#e5383b] disabled:opacity-30"
              >
                <Trash2 className="size-4" />
              </button>
            </div>
          </li>
        ))}
      </ol>
      {items.length < 6 ? (
        <Button size="sm" variant="secondary" onClick={() => set([...items, { id: shortId(6), text: "" }])}>
          <Plus className="size-4" /> {t("order.add")}
        </Button>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------- word cloud

export function WordCloudEditor({
  question,
  onChange,
}: {
  question: Draft<"wordcloud">;
  onChange: Update<Draft<"wordcloud">>;
}) {
  const { t } = useTranslation("editor");
  return (
    <div className="space-y-2">
      <p className="text-sm text-muted">{t("wordcloud.hint")}</p>
      <Field label={t("wordcloud.maxLength")} className="max-w-48">
        <Input
          type="number"
          min={1}
          max={40}
          value={question.maxLength}
          onChange={(e) => onChange({ maxLength: Math.min(40, Math.max(1, e.target.valueAsNumber || 1)) })}
        />
      </Field>
    </div>
  );
}
