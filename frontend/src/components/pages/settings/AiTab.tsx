import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, CircleOff, KeyRound, Sparkles } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Badge, Button, Card, Field, Input, Select, Spinner } from "@/components/ui";
import { useErrorMessage } from "@/hooks/useErrorMessage";
import { api } from "@/lib/api";
import { AI_PROVIDERS, type AiProvider } from "@/shared";

interface AiStatus {
  enabled: boolean;
  source: "user" | "instance" | null;
  provider: AiProvider | null;
  model: string | null;
  userKeysAllowed: boolean;
  dailyLimit: number | null;
  usedToday: number;
}

interface AiSettingsResponse {
  status: AiStatus;
  settings: { provider: AiProvider; model: string | null; baseUrl: string | null; hasKey: boolean } | null;
}

const MODEL_PLACEHOLDERS: Record<AiProvider, string> = {
  anthropic: "claude-opus-5-5",
  openai: "gpt-5-mini",
  openrouter: "anthropic/claude-opus-5-5",
  ollama: "llama3.2",
  "openai-compatible": "model-name",
};

const BASE_URL_PLACEHOLDERS: Partial<Record<AiProvider, string>> = {
  ollama: "http://localhost:11434/v1",
  "openai-compatible": "https://example.com/v1",
};

const PROVIDER_LABELS: Record<AiProvider, string> = {
  anthropic: "Anthropic (Claude)",
  openai: "OpenAI",
  openrouter: "OpenRouter",
  ollama: "Ollama",
  "openai-compatible": "OpenAI-compatible",
};

export function AiTab() {
  const { t } = useTranslation("pages");
  const client = useQueryClient();
  const errorMessage = useErrorMessage();
  const { data, isLoading } = useQuery({
    queryKey: ["me-ai"],
    queryFn: () => api.get<AiSettingsResponse>("/api/me/ai"),
  });

  const [provider, setProvider] = useState<AiProvider>("anthropic");
  const [model, setModel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);

  useEffect(() => {
    if (data?.settings) {
      setProvider(data.settings.provider);
      setModel(data.settings.model ?? "");
      setBaseUrl(data.settings.baseUrl ?? "");
    }
  }, [data?.settings]);

  if (isLoading || !data) return <Spinner />;
  const { status, settings } = data;
  const keepsKey = settings?.hasKey && settings.provider === provider;
  const needsBaseUrl = provider === "ollama" || provider === "openai-compatible";
  const needsKey = provider !== "ollama";

  const refresh = () =>
    Promise.all([
      client.invalidateQueries({ queryKey: ["me-ai"] }),
      client.invalidateQueries({ queryKey: ["ai-status"] }),
    ]);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.put("/api/me/ai", {
        provider,
        ...(model.trim() ? { model: model.trim() } : {}),
        ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
        ...(needsBaseUrl && baseUrl.trim() ? { baseUrl: baseUrl.trim() } : {}),
      });
      setApiKey("");
      await refresh();
      toast.success(t("settings.saved"));
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    setRemoving(true);
    try {
      await api.delete("/api/me/ai");
      setModel("");
      setApiKey("");
      setBaseUrl("");
      await refresh();
      toast.success(t("settings.ai.removed"));
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setRemoving(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <div className="flex items-start gap-4">
          <div
            className={`grid size-12 shrink-0 place-items-center rounded-2xl ${status.enabled ? "bg-[#12b886]/15 text-[#0b7a59] dark:text-[#4fe0b0]" : "bg-surface-2 text-muted"}`}
          >
            {status.enabled ? <CheckCircle2 className="size-6" /> : <CircleOff className="size-6" />}
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-xl font-bold">
              {status.enabled ? t("settings.ai.enabled") : t("settings.ai.disabled")}
            </h2>
            <p className="mt-1 text-sm text-muted">
              {status.enabled
                ? status.source === "user"
                  ? t("settings.ai.usingOwn")
                  : t("settings.ai.usingInstance")
                : t("settings.ai.disabledHint")}
            </p>
            {status.enabled ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {status.provider ? <Badge tone="pop">{PROVIDER_LABELS[status.provider]}</Badge> : null}
                <Badge>{status.model ?? t("settings.ai.defaultModel")}</Badge>
                {status.source === "instance" && status.dailyLimit ? (
                  <Badge tone="sun">
                    {t("settings.ai.usage", { used: status.usedToday, limit: status.dailyLimit })}
                  </Badge>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </Card>

      <Card>
        <h2 className="mb-1 flex items-center gap-2 text-xl font-bold">
          <KeyRound className="size-5" /> {t("settings.ai.ownTitle")}
        </h2>
        <p className="mb-5 text-sm text-muted">{t("settings.ai.ownHint")}</p>
        {!status.userKeysAllowed ? (
          <p className="rounded-2xl bg-surface-2 px-4 py-3 text-sm font-medium">
            {t("common:errors.user_keys_disabled")}
          </p>
        ) : (
          <form onSubmit={save} className="flex max-w-lg flex-col gap-4">
            <Field label={t("settings.ai.provider")} htmlFor="ai-provider">
              <Select id="ai-provider" value={provider} onChange={(e) => setProvider(e.target.value as AiProvider)}>
                {AI_PROVIDERS.map((p) => (
                  <option key={p} value={p}>
                    {PROVIDER_LABELS[p]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t("settings.ai.model")} htmlFor="ai-model" hint={t("settings.ai.modelHint")}>
              <Input
                id="ai-model"
                value={model}
                placeholder={MODEL_PLACEHOLDERS[provider]}
                onChange={(e) => setModel(e.target.value)}
              />
            </Field>
            {needsKey ? (
              <Field
                label={t("settings.ai.apiKey")}
                htmlFor="ai-key"
                hint={keepsKey ? t("settings.ai.keepKey") : t("settings.ai.keyHint")}
              >
                <Input
                  id="ai-key"
                  type="password"
                  autoComplete="off"
                  value={apiKey}
                  placeholder={keepsKey ? "••••••••••••" : ""}
                  onChange={(e) => setApiKey(e.target.value)}
                />
              </Field>
            ) : null}
            {needsBaseUrl ? (
              <Field label={t("settings.ai.baseUrl")} htmlFor="ai-base">
                <Input
                  id="ai-base"
                  type="url"
                  value={baseUrl}
                  placeholder={BASE_URL_PLACEHOLDERS[provider]}
                  onChange={(e) => setBaseUrl(e.target.value)}
                />
              </Field>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button type="submit" loading={saving}>
                <Sparkles className="size-4" /> {t("common:actions.save")}
              </Button>
              {settings ? (
                <Button variant="secondary" onClick={remove} loading={removing}>
                  {t("settings.ai.remove")}
                </Button>
              ) : null}
            </div>
          </form>
        )}
      </Card>
    </div>
  );
}
