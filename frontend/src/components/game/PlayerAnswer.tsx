import { ArrowDown, ArrowUp, Check, Send, X } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, Input } from "@/components/ui";
import { cn } from "@/lib/utils";
import type { Answer, PublicQuestionWithMeta } from "@/shared";
import { AnswerTile } from "./AnswerTile";
import { answerStyle, FALSE_STYLE, TRUE_STYLE } from "./answerStyles";

interface Props {
  question: PublicQuestionWithMeta;
  /** When false only coloured tiles (letter + icon) are shown; the text lives on the big screen. */
  showText: boolean;
  disabled?: boolean;
  onSubmit: (answer: Answer) => void;
}

/** The answer controls a player sees on their phone, one per question type. */
export function PlayerAnswer({ question, showText, disabled, onSubmit }: Props) {
  switch (question.type) {
    case "quiz":
    case "poll":
      return (
        <TileGrid count={question.choices.length}>
          {question.choices.map((c, i) => (
            <AnswerTile
              key={c.id}
              style={answerStyle(i)}
              label={c.text}
              hideLabel={!showText}
              size="lg"
              disabled={disabled}
              onClick={() => onSubmit({ type: question.type, choiceId: c.id } as Answer)}
              className="h-full"
            />
          ))}
        </TileGrid>
      );
    case "multi":
      return <MultiAnswer question={question} showText={showText} disabled={disabled} onSubmit={onSubmit} />;
    case "truefalse":
      return <TrueFalseAnswer disabled={disabled} onSubmit={onSubmit} />;
    case "type":
    case "wordcloud":
      return <TextAnswer type={question.type} maxLength={question.maxLength} disabled={disabled} onSubmit={onSubmit} />;
    case "slider":
      return <SliderAnswer question={question} disabled={disabled} onSubmit={onSubmit} />;
    case "order":
      return <OrderAnswer question={question} disabled={disabled} onSubmit={onSubmit} />;
  }
}

function TileGrid({ count, children }: { count: number; children: React.ReactNode }) {
  return (
    <div className={cn("grid flex-1 auto-rows-fr gap-3", count <= 2 ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-2")}>
      {children}
    </div>
  );
}

function MultiAnswer({
  question,
  showText,
  disabled,
  onSubmit,
}: Omit<Props, "question"> & { question: Extract<PublicQuestionWithMeta, { choices: unknown }> }) {
  const { t } = useTranslation("game");
  const [selected, setSelected] = useState<string[]>([]);
  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  return (
    <div className="flex flex-1 flex-col gap-4">
      <p className="text-center font-semibold text-muted">{t("play.selectAll")}</p>
      <TileGrid count={question.choices.length}>
        {question.choices.map((c, i) => (
          <AnswerTile
            key={c.id}
            style={answerStyle(i)}
            label={c.text}
            hideLabel={!showText}
            size="lg"
            disabled={disabled}
            selected={selected.includes(c.id)}
            dimmed={selected.length > 0 && !selected.includes(c.id)}
            aria-pressed={selected.includes(c.id)}
            onClick={() => toggle(c.id)}
            className="h-full"
            trailing={
              selected.includes(c.id) ? (
                <span className="grid size-8 place-items-center rounded-full bg-white text-ink-900">
                  <Check className="size-5" strokeWidth={3} />
                </span>
              ) : null
            }
          />
        ))}
      </TileGrid>
      <Button
        size="xl"
        variant="dark"
        disabled={disabled || selected.length === 0}
        onClick={() => onSubmit({ type: "multi", choiceIds: selected })}
      >
        <Send className="size-6" /> {t("play.submit")}
      </Button>
    </div>
  );
}

function TrueFalseAnswer({ disabled, onSubmit }: { disabled?: boolean; onSubmit: (a: Answer) => void }) {
  const { t } = useTranslation("common");
  return (
    <div className="grid flex-1 grid-cols-1 gap-4 sm:grid-cols-2">
      {[true, false].map((value) => {
        const style = value ? TRUE_STYLE : FALSE_STYLE;
        const Icon = value ? Check : X;
        return (
          <button
            key={String(value)}
            type="button"
            disabled={disabled}
            onClick={() => onSubmit({ type: "truefalse", value })}
            className={cn(
              "flex min-h-32 flex-col items-center justify-center gap-2 rounded-3xl border-2 border-ink-900 font-display text-3xl font-extrabold text-white shadow-pop transition-all active:translate-y-[3px] active:shadow-none disabled:opacity-60 dark:border-black",
              style.bg,
            )}
          >
            <Icon className="size-12" strokeWidth={3} aria-hidden />
            {value ? t("true") : t("false")}
          </button>
        );
      })}
    </div>
  );
}

function TextAnswer({
  type,
  maxLength,
  disabled,
  onSubmit,
}: {
  type: "type" | "wordcloud";
  maxLength: number;
  disabled?: boolean;
  onSubmit: (a: Answer) => void;
}) {
  const { t } = useTranslation("game");
  const [text, setText] = useState("");
  const submit = () => {
    const value = text.trim();
    if (value) onSubmit({ type, text: value } as Answer);
  };
  return (
    <form
      className="flex flex-1 flex-col justify-center gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <label htmlFor="text-answer" className="text-center font-semibold text-muted">
        {type === "wordcloud" ? t("play.typeWord") : t("play.typeAnswer")}
      </label>
      <Input
        id="text-answer"
        autoFocus
        autoComplete="off"
        autoCapitalize="off"
        spellCheck={false}
        maxLength={maxLength}
        value={text}
        disabled={disabled}
        onChange={(e) => setText(e.target.value)}
        className="h-16 rounded-3xl border-ink-900 text-center font-display text-2xl font-bold dark:border-ink-600"
        placeholder={t("play.answerPlaceholder")}
      />
      <Button type="submit" size="xl" disabled={disabled || !text.trim()}>
        <Send className="size-6" /> {t("play.submit")}
      </Button>
    </form>
  );
}

function SliderAnswer({
  question,
  disabled,
  onSubmit,
}: {
  question: Extract<PublicQuestionWithMeta, { type: "slider" }>;
  disabled?: boolean;
  onSubmit: (a: Answer) => void;
}) {
  const { t, i18n } = useTranslation("game");
  const mid = question.min + Math.round((question.max - question.min) / 2 / question.step) * question.step;
  const [value, setValue] = useState(mid);
  // Slider values are often years, so no thousands separators.
  const fmt = (n: number) =>
    new Intl.NumberFormat(i18n.language, { useGrouping: false, maximumFractionDigits: 2 }).format(n);
  const nudge = (dir: 1 | -1) =>
    setValue((v) => Math.min(question.max, Math.max(question.min, Number((v + dir * question.step).toFixed(6)))));
  return (
    <div className="flex flex-1 flex-col justify-center gap-6">
      <div className="text-center">
        <div className="font-display text-6xl font-extrabold tabular-nums" aria-live="polite">
          {fmt(value)}
          {question.unit ? <span className="ml-2 text-3xl text-muted">{question.unit}</span> : null}
        </div>
      </div>
      <div className="flex items-center gap-3">
        <Button variant="secondary" size="icon" onClick={() => nudge(-1)} disabled={disabled} aria-label="−">
          −
        </Button>
        <input
          type="range"
          min={question.min}
          max={question.max}
          step={question.step}
          value={value}
          disabled={disabled}
          onChange={(e) => setValue(Number(e.target.value))}
          className="h-10 flex-1 cursor-pointer accent-pop-500"
          aria-label={t("play.sliderLabel")}
        />
        <Button variant="secondary" size="icon" onClick={() => nudge(1)} disabled={disabled} aria-label="+">
          +
        </Button>
      </div>
      <div className="flex justify-between text-sm font-semibold text-muted tabular-nums">
        <span>{fmt(question.min)}</span>
        <span>{fmt(question.max)}</span>
      </div>
      <Button size="xl" disabled={disabled} onClick={() => onSubmit({ type: "slider", value })}>
        <Send className="size-6" /> {t("play.submit")}
      </Button>
    </div>
  );
}

function OrderAnswer({
  question,
  disabled,
  onSubmit,
}: {
  question: Extract<PublicQuestionWithMeta, { type: "order" }>;
  disabled?: boolean;
  onSubmit: (a: Answer) => void;
}) {
  const { t } = useTranslation("game");
  const [items, setItems] = useState(question.items);
  const move = (index: number, dir: -1 | 1) =>
    setItems((list) => {
      const target = index + dir;
      if (target < 0 || target >= list.length) return list;
      const next = [...list];
      [next[index], next[target]] = [next[target] as (typeof list)[number], next[index] as (typeof list)[number]];
      return next;
    });
  return (
    <div className="flex flex-1 flex-col gap-4">
      <p className="text-center font-semibold text-muted">{t("play.orderHint")}</p>
      <ol className="flex flex-col gap-2.5">
        {items.map((item, i) => {
          const style = answerStyle(i);
          return (
            <li
              key={item.id}
              className={cn(
                "flex items-center gap-3 rounded-2xl border-2 border-ink-900 p-2 pl-3 font-bold text-white shadow-pop-sm dark:border-black",
                style.bg,
              )}
            >
              <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-white/25 font-display text-lg">
                {i + 1}
              </span>
              <span className="min-w-0 flex-1 break-words text-lg [text-shadow:0_1px_2px_rgb(0_0_0/0.25)]">
                {item.text}
              </span>
              <div className="flex shrink-0 gap-1">
                <button
                  type="button"
                  className="grid size-11 place-items-center rounded-xl bg-white/25 hover:bg-white/40 disabled:opacity-30"
                  onClick={() => move(i, -1)}
                  disabled={disabled || i === 0}
                  aria-label={t("play.moveUp", { item: item.text })}
                >
                  <ArrowUp className="size-5" />
                </button>
                <button
                  type="button"
                  className="grid size-11 place-items-center rounded-xl bg-white/25 hover:bg-white/40 disabled:opacity-30"
                  onClick={() => move(i, 1)}
                  disabled={disabled || i === items.length - 1}
                  aria-label={t("play.moveDown", { item: item.text })}
                >
                  <ArrowDown className="size-5" />
                </button>
              </div>
            </li>
          );
        })}
      </ol>
      <Button
        size="xl"
        variant="dark"
        disabled={disabled}
        onClick={() => onSubmit({ type: "order", itemIds: items.map((i) => i.id) })}
      >
        <Send className="size-6" /> {t("play.submit")}
      </Button>
    </div>
  );
}
