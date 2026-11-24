import { Globe, Link2, Lock } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button, Dialog, Field, Select, Textarea } from "@/components/ui";
import { cn } from "@/lib/utils";
import { VISIBILITIES, type Visibility } from "@/shared";
import { ChipsInput } from "./ChipsInput";
import { LANGUAGE_OPTIONS } from "./defaults";
import { ImageField } from "./ImageField";

export interface QuizMeta {
  description: string;
  language: string;
  visibility: Visibility;
  tags: string[];
  coverImage: string | null;
}

const VIS_ICONS = { private: Lock, unlisted: Link2, public: Globe } as const;

export function QuizSettingsDialog({
  open,
  onClose,
  value,
  onChange,
}: {
  open: boolean;
  onClose: () => void;
  value: QuizMeta;
  onChange: (patch: Partial<QuizMeta>) => void;
}) {
  const { t } = useTranslation("editor");
  const languages = LANGUAGE_OPTIONS.some((l) => l.code === value.language)
    ? LANGUAGE_OPTIONS
    : [...LANGUAGE_OPTIONS, { code: value.language, label: value.language }];

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t("settings.title")}
      description={t("settings.description")}
      size="lg"
      footer={<Button onClick={onClose}>{t("settings.done")}</Button>}
    >
      <div className="space-y-5">
        <Field
          label={t("settings.quizDescription")}
          htmlFor="quiz-description"
          hint={`${value.description.length}/1000`}
        >
          <Textarea
            id="quiz-description"
            value={value.description}
            maxLength={1000}
            rows={3}
            placeholder={t("settings.descriptionPlaceholder")}
            onChange={(e) => onChange({ description: e.target.value })}
          />
        </Field>

        <Field label={t("settings.language")} htmlFor="quiz-language" hint={t("settings.languageHint")}>
          <Select id="quiz-language" value={value.language} onChange={(e) => onChange({ language: e.target.value })}>
            {languages.map((l) => (
              <option key={l.code} value={l.code}>
                {l.label}
              </option>
            ))}
          </Select>
        </Field>

        <fieldset className="space-y-2">
          <legend className="mb-1.5 text-sm font-semibold">{t("settings.visibility")}</legend>
          <div className="grid gap-2 sm:grid-cols-3">
            {VISIBILITIES.map((v) => {
              const Icon = VIS_ICONS[v];
              const active = value.visibility === v;
              return (
                <button
                  key={v}
                  type="button"
                  aria-pressed={active}
                  onClick={() => onChange({ visibility: v })}
                  className={cn(
                    "flex flex-col items-start gap-1 rounded-2xl border-2 p-3 text-left transition-colors",
                    active ? "border-pop-500 bg-pop-50 dark:bg-pop-900/25" : "border-border hover:border-pop-300",
                  )}
                >
                  <span className="inline-flex items-center gap-2 font-bold">
                    <Icon className="size-4" /> {t(`common:visibility.${v}`)}
                  </span>
                  <span className="text-xs text-muted">{t(`common:visibilityHints.${v}`)}</span>
                </button>
              );
            })}
          </div>
        </fieldset>

        <Field label={t("settings.tags")} htmlFor="quiz-tags" hint={t("settings.tagsHint")}>
          <ChipsInput
            id="quiz-tags"
            value={value.tags}
            onChange={(tags) => onChange({ tags })}
            max={10}
            maxLength={30}
            lowercase
            label={t("settings.tags")}
            placeholder={t("settings.tagsPlaceholder")}
          />
        </Field>

        <Field label={t("settings.cover")}>
          <ImageField value={value.coverImage} onChange={(coverImage) => onChange({ coverImage })} compact />
        </Field>
      </div>
    </Dialog>
  );
}
