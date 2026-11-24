import { useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { Button, Card, Field, Input } from "@/components/ui";
import { useErrorMessage } from "@/hooks/useErrorMessage";
import { api } from "@/lib/api";
import { ConfirmDialog } from "../ConfirmDialog";

export function SecurityTab() {
  const { t } = useTranslation("pages");
  const errorMessage = useErrorMessage();
  const navigate = useNavigate();
  const client = useQueryClient();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [revokeOpen, setRevokeOpen] = useState(false);
  const [revoking, setRevoking] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (next.length < 8) return setError(t("auth.passwordTooShort"));
    if (next !== confirm) return setError(t("settings.security.mismatch"));
    setSaving(true);
    try {
      await api.post("/api/me/password", { currentPassword: current, newPassword: next });
      setCurrent("");
      setNext("");
      setConfirm("");
      toast.success(t("settings.security.changed"));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const revokeAll = async () => {
    setRevoking(true);
    try {
      await api.post("/api/me/sessions/revoke-all");
      client.clear();
      client.setQueryData(["me"], { user: null });
      navigate("/login");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setRevoking(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <h2 className="mb-1 text-xl font-bold">{t("settings.security.passwordTitle")}</h2>
        <p className="mb-5 text-sm text-muted">{t("settings.security.passwordHint")}</p>
        <form onSubmit={submit} className="flex max-w-lg flex-col gap-4">
          <Field label={t("settings.security.current")} htmlFor="pw-current">
            <Input
              id="pw-current"
              type="password"
              autoComplete="current-password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
            />
          </Field>
          <Field label={t("settings.security.new")} htmlFor="pw-new" hint={t("auth.passwordHint")}>
            <Input
              id="pw-new"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={next}
              onChange={(e) => setNext(e.target.value)}
            />
          </Field>
          <Field label={t("settings.security.confirm")} htmlFor="pw-confirm" error={error}>
            <Input
              id="pw-confirm"
              type="password"
              autoComplete="new-password"
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </Field>
          <div>
            <Button type="submit" loading={saving}>
              {t("settings.security.change")}
            </Button>
          </div>
        </form>
      </Card>
      <Card>
        <h2 className="mb-1 text-xl font-bold">{t("settings.security.sessionsTitle")}</h2>
        <p className="mb-4 text-sm text-muted">{t("settings.security.sessionsHint")}</p>
        <Button variant="secondary" onClick={() => setRevokeOpen(true)}>
          {t("settings.security.revokeAll")}
        </Button>
      </Card>
      <ConfirmDialog
        open={revokeOpen}
        onClose={() => setRevokeOpen(false)}
        onConfirm={revokeAll}
        loading={revoking}
        title={t("settings.security.revokeAll")}
        description={t("settings.security.revokeConfirm")}
        confirmLabel={t("settings.security.revokeAll")}
      />
    </div>
  );
}
