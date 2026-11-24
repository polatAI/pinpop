import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Button, Dialog } from "@/components/ui";

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel,
  loading,
  children,
  disabled,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: ReactNode;
  description?: ReactNode;
  confirmLabel?: ReactNode;
  loading?: boolean;
  disabled?: boolean;
  children?: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t("actions.cancel")}
          </Button>
          <Button variant="danger" onClick={onConfirm} loading={loading} disabled={disabled}>
            {confirmLabel ?? t("actions.delete")}
          </Button>
        </>
      }
    >
      <p className="text-muted">{description ?? t("confirmDelete")}</p>
      {children}
    </Dialog>
  );
}
