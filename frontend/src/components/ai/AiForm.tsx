import { Sparkles } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { LANGUAGE_OPTIONS } from "@/components/editor/defaults";
import { TypeIcon } from "@/components/editor/typeIcons";
import { Field, Input, Select } from "@/components/ui";
import { cn } from "@/lib/utils";
import { DIFFICULTIES, type Difficulty, QUESTION_TYPES, type QuestionType, TIME_LIMITS } from "@/shared";

export interface AiOptions {
  count: number;
  difficulty: Difficulty;
  language: string;
  types: QuestionType[];
  timeLimit: number;
  audience: string;
}

export function defaultAiOptions(language: string): AiOptions {
  return { count: 10, difficulty: "medium", language, types: ["quiz", "truefalse"], timeLimit: 20, audience: "" };
}

/** Count, difficulty, language, question types, timer and audience controls shared by the AI dialogs. */
export function AiOptionsFields({
  value,
  onChange,
  maxCount = 30,
}: {
  value: AiOptions;
  onChange: (v: AiOptions) => void;
  maxCount?: number;
}) {
  const { t } = useTranslation("editor");
  const set = (p: Partial<AiOptions>) => onChange({ ...value, ...p });
  const languages = LANGUAGE_OPTIONS.some((l) => l.code === value.language)
    ? LANGUAGE_OPTIONS
    : [...LANGUAGE_OPTIONS, { code: value.language, label: value.language }];

  function toggleType(type: QuestionType) {
    const has = value.types.includes(type);
    if (has && value.types.length === 1) return;
    set({ types: has ? value.types.filter((x) => x !== type) : [...value.types, type] });
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Field label={t("aiGen.count")} htmlFor="ai-count">
          <Input
            id="ai-count"
            type="number"
            min={1}
            max={maxCount}
            value={value.count}
            onChange={(e) => set({ count: Math.min(maxCount, Math.max(1, e.target.valueAsNumber || 1)) })}
          />
        </Field>
        <Field label={t("aiGen.difficulty")} htmlFor="ai-difficulty">
          <Select
            id="ai-difficulty"
            value={value.difficulty}
            onChange={(e) => set({ difficulty: e.target.value as Difficulty })}
          >
            {DIFFICULTIES.map((d) => (
              <option key={d} value={d}>
                {t(`common:difficulty.${d}`)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t("aiGen.language")} htmlFor="ai-language">
          <Select id="ai-language" value={value.language} onChange={(e) => set({ language: e.target.value })}>
            {languages.map((l) => (
              <option key={l.code} value={l.code}>
                {l.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t("aiGen.timeLimit")} htmlFor="ai-time">
          <Select id="ai-time" value={value.timeLimit} onChange={(e) => set({ timeLimit: Number(e.target.value) })}>
            {TIME_LIMITS.map((s) => (
              <option key={s} value={s}>
                {t("common:seconds", { count: s })}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <fieldset>
        <legend className="mb-1.5 text-sm font-semibold">{t("aiGen.types")}</legend>
        <div className="flex flex-wrap gap-2">
          {QUESTION_TYPES.map((type) => {
            const active = value.types.includes(type);
            return (
              <button
                key={type}
                type="button"
                aria-pressed={active}
                onClick={() => toggleType(type)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-xl border-2 px-3 py-1.5 text-sm font-semibold transition-colors",
                  active
                    ? "border-pop-500 bg-pop-50 text-pop-700 dark:bg-pop-900/30 dark:text-pop-200"
                    : "border-border text-muted hover:text-fg",
                )}
              >
                <TypeIcon type={type} className="size-4" />
                {t(`common:questionTypes.${type}`)}
              </button>
            );
          })}
        </div>
      </fieldset>

      <Field label={t("aiGen.audience")} htmlFor="ai-audience" hint={t("aiGen.audienceHint")}>
        <Input
          id="ai-audience"
          value={value.audience}
          maxLength={120}
          placeholder={t("aiGen.audiencePlaceholder")}
          onChange={(e) => set({ audience: e.target.value })}
        />
      </Field>
    </div>
  );
}

const MESSAGES = ["loading1", "loading2", "loading3", "loading4", "loading5"] as const;

/** Playful waiting screen while the model writes questions (this can take up to a minute). */
export function AiWorking() {
  const { t } = useTranslation("editor");
  const [i, setI] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setI((n) => (n + 1) % MESSAGES.length), 3500);
    return () => window.clearInterval(id);
  }, []);
  return (
    <div className="flex flex-col items-center gap-5 py-10 text-center" role="status" aria-live="polite">
      <div className="relative size-24">
        <motion.div
          className="absolute inset-0 grid place-items-center rounded-3xl border-2 border-ink-900 bg-gradient-to-br from-pop-500 to-tang-500 text-white shadow-pop dark:border-black"
          animate={{ rotate: [0, -6, 6, 0], scale: [1, 1.05, 1] }}
          transition={{ repeat: Number.POSITIVE_INFINITY, duration: 2.2, ease: "easeInOut" }}
        >
          <Sparkles className="size-10" />
        </motion.div>
        {[0, 1, 2].map((n) => (
          <motion.span
            key={n}
            className="absolute size-3 rounded-full bg-sun-400"
            style={{ top: n === 0 ? -6 : n === 1 ? "40%" : "90%", left: n === 1 ? -10 : n === 0 ? "80%" : "85%" }}
            animate={{ scale: [0, 1, 0], opacity: [0, 1, 0] }}
            transition={{ repeat: Number.POSITIVE_INFINITY, duration: 1.6, delay: n * 0.5 }}
          />
        ))}
      </div>
      <div>
        <p className="font-display text-xl font-extrabold">{t("aiGen.working")}</p>
        <motion.p key={i} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="mt-1 text-muted">
          {t(`aiGen.${MESSAGES[i]}`)}
        </motion.p>
      </div>
    </div>
  );
}
