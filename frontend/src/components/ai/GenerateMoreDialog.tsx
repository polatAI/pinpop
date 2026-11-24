import { Sparkles, Wand2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button, Dialog, Field, Textarea } from "@/components/ui";
import { useErrorMessage } from "@/hooks/useErrorMessage";
import { api } from "@/lib/api";
import type { Question } from "@/shared";
import { type AiOptions, AiOptionsFields, AiWorking, defaultAiOptions } from "./AiForm";
import { AiDisabledPanel } from "./AiGenerateDialog";
import { useAiStatus } from "./useAiStatus";

/** Generates extra questions for the quiz being edited and hands them back without saving. */
export function GenerateMoreDialog({
  open,
  onClose,
  quizTitle,
  quizDescription,
  language,
  existing,
  onGenerated,
}: {
  open: boolean;
  onClose: () => void;
  quizTitle: string;
  quizDescription: string;
  language: string;
  existing: Question[];
  onGenerated: (questions: Question[]) => void;
}) {
  const { t } = useTranslation("editor");
  const errorMessage = useErrorMessage();
  const status = useAiStatus(open);
  const [topic, setTopic] = useState("");
  const [options, setOptions] = useState<AiOptions>(() => ({ ...defaultAiOptions(language), count: 5 }));
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTopic([quizTitle, quizDescription].filter((s) => s.trim()).join(" — "));
    setOptions((o) => ({ ...o, language }));
  }, [open, quizTitle, quizDescription, language]);

  const room = Math.max(0, 100 - existing.length);

  async function submit() {
    if (!topic.trim() || room === 0) return;
    setBusy(true);
    try {
      const avoid = existing
        .map((q) => q.text)
        .filter(Boolean)
        .slice(-40)
        .join(" | ");
      const res = await api.post<{ quiz: { questions: Question[] } }>("/api/ai/generate", {
        topic: avoid
          ? `${topic.trim()}\n\nDo not repeat these existing questions: ${avoid}`.slice(0, 500)
          : topic.trim(),
        count: Math.min(options.count, room),
        difficulty: options.difficulty,
        language: options.language,
        types: options.types,
        timeLimit: options.timeLimit,
        audience: options.audience.trim() || undefined,
        save: false,
      });
      onGenerated(res.quiz.questions);
      toast.success(t("aiGen.added", { count: res.quiz.questions.length }));
      onClose();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const enabled = status.data?.enabled;
  return (
    <Dialog
      open={open}
      onClose={() => !busy && onClose()}
      size="lg"
      title={
        <span className="inline-flex items-center gap-2">
          <Sparkles className="size-5 text-pop-500" /> {t("aiGen.moreTitle")}
        </span>
      }
      description={enabled ? t("aiGen.moreSubtitle") : undefined}
      footer={
        enabled && !busy ? (
          <>
            <Button variant="ghost" onClick={onClose}>
              {t("common:actions.cancel")}
            </Button>
            <Button onClick={() => void submit()} disabled={!topic.trim() || room === 0}>
              <Wand2 className="size-4" /> {t("aiGen.generate")}
            </Button>
          </>
        ) : undefined
      }
    >
      {status.isLoading || busy ? (
        <AiWorking />
      ) : !enabled ? (
        <AiDisabledPanel onNavigate={onClose} />
      ) : (
        <div className="space-y-5">
          <Field label={t("aiGen.topic")} htmlFor="ai-more-topic">
            <Textarea
              id="ai-more-topic"
              rows={2}
              maxLength={400}
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
            />
          </Field>
          <AiOptionsFields value={options} onChange={setOptions} maxCount={Math.min(30, Math.max(1, room))} />
        </div>
      )}
    </Dialog>
  );
}
