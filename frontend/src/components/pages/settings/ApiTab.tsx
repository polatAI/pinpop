import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ExternalLink, KeyRound, Plug, Plus, Trash2 } from "lucide-react";
import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Badge, Button, Card, Input, Spinner, Tabs } from "@/components/ui";
import { useErrorMessage } from "@/hooks/useErrorMessage";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/utils";
import type { ApiTokenInfo } from "@/shared";
import { ConfirmDialog } from "../ConfirmDialog";
import { CopyBox } from "../common";

type Client = "claudeCode" | "claudeDesktop" | "cursor" | "remote";

export function ApiTab() {
  const { t, i18n } = useTranslation("pages");
  const client = useQueryClient();
  const errorMessage = useErrorMessage();
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [newToken, setNewToken] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<ApiTokenInfo | null>(null);
  const [mcpClient, setMcpClient] = useState<Client>("claudeCode");

  const { data, isLoading } = useQuery({
    queryKey: ["tokens"],
    queryFn: () => api.get<{ items: ApiTokenInfo[] }>("/api/me/tokens"),
  });

  const create = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setCreating(true);
    try {
      const res = await api.post<{ token: string }>("/api/me/tokens", { name: name.trim() });
      setNewToken(res.token);
      setName("");
      await client.invalidateQueries({ queryKey: ["tokens"] });
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setCreating(false);
    }
  };

  const remove = async () => {
    if (!toDelete) return;
    try {
      await api.delete(`/api/me/tokens/${toDelete.id}`);
      setToDelete(null);
      await client.invalidateQueries({ queryKey: ["tokens"] });
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const origin = window.location.origin;
  const token = newToken ?? "<YOUR_TOKEN>";
  const stdioConfig = JSON.stringify(
    {
      mcpServers: {
        pinpop: {
          command: "uvx",
          args: ["--from", "git+https://github.com/polatAI/pinpop#subdirectory=backend", "pinpop-mcp"],
          env: { PINPOP_URL: origin, PINPOP_TOKEN: token },
        },
      },
    },
    null,
    2,
  );
  const snippets: Record<Client, { label: string; value: string; hint: string }> = {
    claudeCode: {
      label: "Claude Code",
      value: `claude mcp add --transport http pinpop ${origin}/mcp --header "Authorization: Bearer ${token}"`,
      hint: t("settings.api.hintClaudeCode"),
    },
    claudeDesktop: { label: "Claude Desktop", value: stdioConfig, hint: t("settings.api.hintClaudeDesktop") },
    cursor: { label: "Cursor", value: stdioConfig, hint: t("settings.api.hintCursor") },
    remote: {
      label: t("settings.api.remote"),
      value: `URL:     ${origin}/mcp\nHeader:  Authorization: Bearer ${token}`,
      hint: t("settings.api.hintRemote"),
    },
  };
  const snippet = snippets[mcpClient];

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <h2 className="mb-1 flex items-center gap-2 text-xl font-bold">
          <KeyRound className="size-5" /> {t("settings.api.tokensTitle")}
        </h2>
        <p className="mb-5 text-sm text-muted">{t("settings.api.tokensHint")}</p>

        {newToken ? (
          <div className="mb-5 rounded-2xl border-2 border-sun-500 bg-sun-400/15 p-4">
            <p className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <AlertTriangle className="size-4 text-[#b07800]" /> {t("settings.api.copyNow")}
            </p>
            <CopyBox value={newToken} />
            <Button variant="ghost" size="sm" className="mt-2" onClick={() => setNewToken(null)}>
              {t("settings.api.done")}
            </Button>
          </div>
        ) : null}

        <form onSubmit={create} className="mb-5 flex max-w-lg gap-2">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("settings.api.namePlaceholder")}
            maxLength={60}
            aria-label={t("settings.api.tokenName")}
          />
          <Button type="submit" loading={creating} disabled={!name.trim()}>
            <Plus className="size-4" /> {t("common:actions.create")}
          </Button>
        </form>

        {isLoading ? (
          <Spinner />
        ) : !data?.items.length ? (
          <p className="text-sm text-muted">{t("settings.api.noTokens")}</p>
        ) : (
          <ul className="divide-y-2 divide-border rounded-2xl border-2 border-border">
            {data.items.map((tk) => (
              <li key={tk.id} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="font-semibold">{tk.name}</div>
                  <div className="text-xs text-muted">
                    <code className="font-mono">{tk.prefix}…</code> ·{" "}
                    {t("settings.api.created", { date: formatDate(tk.createdAt, i18n.language) })} ·{" "}
                    {tk.lastUsedAt
                      ? t("settings.api.lastUsed", { date: formatDate(tk.lastUsedAt, i18n.language) })
                      : t("settings.api.neverUsed")}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setToDelete(tk)}
                  className="rounded-xl p-2 text-muted hover:bg-surface-2 hover:text-[#e5383b]"
                  aria-label={t("common:actions.delete")}
                >
                  <Trash2 className="size-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <h2 className="mb-1 flex items-center gap-2 text-xl font-bold">
          <Plug className="size-5" /> {t("settings.api.mcpTitle")} <Badge tone="pop">MCP</Badge>
        </h2>
        <p className="mb-5 text-sm text-muted">{t("settings.api.mcpHint")}</p>
        <Tabs
          value={mcpClient}
          onChange={setMcpClient}
          items={(Object.keys(snippets) as Client[]).map((k) => ({ value: k, label: snippets[k].label }))}
          className="mb-4"
        />
        <p className="mb-3 text-sm text-muted">{snippet.hint}</p>
        <CopyBox value={snippet.value} multiline />
        {!newToken ? <p className="mt-3 text-xs text-muted">{t("settings.api.replaceToken")}</p> : null}
        <p className="mt-5 text-sm font-semibold">{t("settings.api.tryIt")}</p>
        <p className="mt-1 rounded-2xl bg-surface-2 px-4 py-3 text-sm italic">“{t("settings.api.examplePrompt")}”</p>
      </Card>

      <Card>
        <h2 className="mb-1 text-xl font-bold">{t("settings.api.restTitle")}</h2>
        <p className="mb-4 text-sm text-muted">{t("settings.api.restHint")}</p>
        <a href="/api/docs" target="_blank" rel="noreferrer">
          <Button variant="secondary">
            <ExternalLink className="size-4" /> {t("settings.api.openDocs")}
          </Button>
        </a>
      </Card>

      <ConfirmDialog
        open={toDelete !== null}
        onClose={() => setToDelete(null)}
        onConfirm={remove}
        title={t("settings.api.deleteTitle", { name: toDelete?.name ?? "" })}
        description={t("settings.api.deleteText")}
      />
    </div>
  );
}
