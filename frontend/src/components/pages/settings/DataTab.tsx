import { Download, Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { Button, Card, Field, Input } from "@/components/ui";
import { useAuth } from "@/hooks/useAuth";
import { useErrorMessage } from "@/hooks/useErrorMessage";
import { api, download } from "@/lib/api";
import { ConfirmDialog } from "../ConfirmDialog";

export function DataTab() {
  const { t } = useTranslation("pages");
  const { logout } = useAuth();
  const navigate = useNavigate();
  const errorMessage = useErrorMessage();
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);

  const remove = async () => {
    setDeleting(true);
    try {
      await api.delete("/api/me", { confirm: "DELETE" });
      await logout().catch(() => undefined);
      toast.success(t("settings.data.deleted"));
      navigate("/");
    } catch (err) {
      toast.error(errorMessage(err));
      setDeleting(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <h2 className="mb-1 text-xl font-bold">{t("settings.data.exportTitle")}</h2>
        <p className="mb-4 text-sm text-muted">{t("settings.data.exportHint")}</p>
        <Button variant="secondary" onClick={() => download("/api/me/export")}>
          <Download className="size-4" /> {t("settings.data.exportButton")}
        </Button>
      </Card>
      <Card className="border-[#e5383b]/40">
        <h2 className="mb-1 text-xl font-bold text-[#e5383b]">{t("settings.data.deleteTitle")}</h2>
        <p className="mb-4 text-sm text-muted">{t("settings.data.deleteHint")}</p>
        <Button variant="danger" onClick={() => setOpen(true)}>
          <Trash2 className="size-4" /> {t("settings.data.deleteButton")}
        </Button>
      </Card>
      <ConfirmDialog
        open={open}
        onClose={() => {
          setOpen(false);
          setConfirm("");
        }}
        onConfirm={remove}
        loading={deleting}
        disabled={confirm !== "DELETE"}
        title={t("settings.data.deleteTitle")}
        description={t("settings.data.deleteConfirm")}
        confirmLabel={t("settings.data.deleteButton")}
      >
        <Field label={t("settings.data.typeDelete")} htmlFor="confirm-delete" className="mt-4">
          <Input
            id="confirm-delete"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="off"
            placeholder="DELETE"
          />
        </Field>
      </ConfirmDialog>
    </div>
  );
}
