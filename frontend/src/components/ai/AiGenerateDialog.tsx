import { FileText, Globe, Lightbulb, Sparkles, Upload, Wand2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { Button, Dialog, Field, Input, Tabs, Textarea } from "@/components/ui";
import { useErrorMessage } from "@/hooks/useErrorMessage";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { type AiOptions, AiOptionsFields, AiWorking, defaultAiOptions } from "./AiForm";
import { useAiStatus } from "./useAiStatus";

type Source = "topic" | "text" | "link" | "file";

const IDEAS = ["idea1", "idea2", "idea3", "idea4"] as const;

/** Shown when no AI provider is configured for the user or the instance. */
export function AiDisabledPanel({ onNavigate }: { onNavigate?: () => void }) {
  const { t } = useTranslation("editor");
  const navigate = useNavigate();
  return (
    <div className="flex flex-col items-center gap-3 py-6 text-center">
      <div className="grid size-16 place-items-center rounded-3xl bg-surface-2 text-3xl">🤖</div>
      <h3 className="text-xl font-bold">{t("aiGen.disabledTitle")}</h3>
      <p className="max-w-md text-muted">{t("aiGen.disabledText")}</p>
      <Button
        onClick={() => {
          onNavigate?.();
          navigate("/settings#ai");
        }}
      >
        {t("aiGen.openSettings")}
      </Button>
    </div>
  );
}

export function AiGenerateDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t, i18n } = useTranslation("editor");
  const navigate = useNavigate();
  const errorMessage = useErrorMessage();
  const status = useAiStatus(open);
  const [source, setSource] = useState<Source>("topic");
  const [topic, setTopic] = useState("");
  const [text, setText] = useState("");
  const [url, setUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [options, setOptions] = useState<AiOptions>(() => defaultAiOptions(i18n.language.slice(0, 2)));
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) setOptions((o) => ({ ...o, language: o.language || i18n.language.slice(0, 2) }));
  }, [open, i18n.language]);

  const canSubmit =
    !busy &&
    (source === "topic"
      ? topic.trim().length > 2
      : source === "text"
        ? text.trim().length >= 40
        : source === "link"
          ? /^https?:\/\/\S+\.\S+/.test(url.trim())
          : file !== null);

  async function submit() {
    if (!canSubmit) return;
    setBusy(true);
    try {
      let res: { quizId: string | null };
      const common = {
        count: options.count,
        difficulty: options.difficulty,
        language: options.language,
        types: options.types,
        timeLimit: options.timeLimit,
        audience: options.audience.trim() || undefined,
        save: true,
      };
      if (source === "file" && file) {
        const form = new FormData();
        form.append("topic", topic.trim());
        form.append("count", String(options.count));
        form.append("difficulty", options.difficulty);
        form.append("language", options.language);
        form.append("types", options.types.join(","));
        form.append("timeLimit", String(options.timeLimit));
        form.append("save", "true");
        form.append("file", file);
        res = await api.upload("/api/ai/generate-from-file", form);
      } else {
        res = await api.post("/api/ai/generate", {
          ...common,
          topic: topic.trim() || undefined,
          sourceText: source === "text" ? text.trim() : undefined,
          sourceUrl: source === "link" ? url.trim() : undefined,
        });
      }
      if (!res.quizId) throw new Error("missing quiz id");
      toast.success(t("aiGen.success"));
      onClose();
      navigate(`/quiz/${res.quizId}/edit`);
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
          <Sparkles className="size-5 text-pop-500" /> {t("aiGen.title")}
        </span>
      }
      description={enabled === false ? undefined : t("aiGen.subtitle")}
      footer={
        enabled && !busy ? (
          <>
            <Button variant="ghost" onClick={onClose}>
              {t("common:actions.cancel")}
            </Button>
            <Button onClick={() => void submit()} disabled={!canSubmit}>
              <Wand2 className="size-4" /> {t("aiGen.generate")}
            </Button>
          </>
        ) : undefined
      }
    >
      {status.isLoading ? (
        <AiWorking />
      ) : !enabled ? (
        <AiDisabledPanel onNavigate={onClose} />
      ) : busy ? (
        <AiWorking />
      ) : (
        <form
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <Tabs<Source>
            value={source}
            onChange={setSource}
            items={[
              { value: "topic", label: t("aiGen.tabs.topic"), icon: <Lightbulb className="size-4" /> },
              { value: "text", label: t("aiGen.tabs.text"), icon: <FileText className="size-4" /> },
              { value: "link", label: t("aiGen.tabs.link"), icon: <Globe className="size-4" /> },
              { value: "file", label: t("aiGen.tabs.file"), icon: <Upload className="size-4" /> },
            ]}
          />

          {source === "topic" ? (
            <Field label={t("aiGen.topic")} htmlFor="ai-topic" hint={t("aiGen.topicHint")}>
              <Textarea
                id="ai-topic"
                autoFocus
                rows={2}
                maxLength={500}
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder={t("aiGen.topicPlaceholder")}
              />
              <div className="mt-1 flex flex-wrap gap-1.5">
                {IDEAS.map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setTopic(t(`aiGen.${k}`))}
                    className="rounded-xl bg-surface-2 px-2.5 py-1 text-xs font-semibold text-muted hover:text-fg"
                  >
                    {t(`aiGen.${k}`)}
                  </button>
                ))}
              </div>
            </Field>
          ) : (
            <Field label={t("aiGen.focus")} htmlFor="ai-focus" hint={t("aiGen.focusHint")}>
              <Input
                id="ai-focus"
                value={topic}
                maxLength={500}
                onChange={(e) => setTopic(e.target.value)}
                placeholder={t("aiGen.focusPlaceholder")}
              />
            </Field>
          )}

          {source === "text" ? (
            <Field
              label={t("aiGen.text")}
              htmlFor="ai-text"
              hint={`${text.length.toLocaleString()}/60,000 · ${t("aiGen.textHint")}`}
            >
              <Textarea
                id="ai-text"
                rows={7}
                maxLength={60000}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={t("aiGen.textPlaceholder")}
              />
            </Field>
          ) : null}

          {source === "link" ? (
            <Field label={t("aiGen.link")} htmlFor="ai-url" hint={t("aiGen.linkHint")}>
              <Input
                id="ai-url"
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://en.wikipedia.org/wiki/…"
              />
            </Field>
          ) : null}

          {source === "file" ? (
            <Field label={t("aiGen.file")} hint={t("aiGen.fileHint")}>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const f = e.dataTransfer.files?.[0];
                  if (f) setFile(f);
                }}
                className={cn(
                  "flex w-full flex-col items-center gap-2 rounded-2xl border-2 border-dashed px-4 py-8 text-center transition-colors",
                  file ? "border-pop-500 bg-pop-50 dark:bg-pop-900/20" : "border-border hover:border-pop-300",
                )}
              >
                <Upload className="size-6 text-muted" />
                {file ? (
                  <span className="font-semibold">
                    {file.name} <span className="text-muted">({Math.ceil(file.size / 1024)} KB)</span>
                  </span>
                ) : (
                  <span className="text-muted">{t("aiGen.fileDrop")}</span>
                )}
              </button>
              <input
                ref={fileRef}
                type="file"
                accept=".pdf,.txt,.md,.markdown,application/pdf,text/plain,text/markdown"
                className="hidden"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </Field>
          ) : null}

          <AiOptionsFields value={options} onChange={setOptions} />
          <button type="submit" className="hidden" aria-hidden tabIndex={-1} />
        </form>
      )}
    </Dialog>
  );
}
