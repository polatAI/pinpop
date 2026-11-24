import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronRight, Link2, Lock, LockOpen, Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { toast } from "sonner";
import { Badge, Button, EmptyState, Spinner } from "@/components/ui";
import { useErrorMessage } from "@/hooks/useErrorMessage";
import { api } from "@/lib/api";
import { copyText, formatDate } from "@/lib/utils";
import type { AssignmentSummary } from "@/shared";
import { ConfirmDialog } from "./ConfirmDialog";

/** Homework (self-paced assignments) shown as a tab on the reports page. */
export function AssignmentList() {
  const { t, i18n } = useTranslation("pages");
  const client = useQueryClient();
  const errorMessage = useErrorMessage();
  const [toDelete, setToDelete] = useState<AssignmentSummary | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["assignments"],
    queryFn: () => api.get<{ items: AssignmentSummary[] }>("/api/assignments"),
  });

  const refresh = () => client.invalidateQueries({ queryKey: ["assignments"] });
  const toggle = useMutation({
    mutationFn: (a: AssignmentSummary) => api.patch(`/api/assignments/${a.id}`, { closed: !a.closed }),
    onSuccess: refresh,
    onError: (err) => toast.error(errorMessage(err)),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/api/assignments/${id}`),
    onSuccess: async () => {
      setToDelete(null);
      await refresh();
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  if (isLoading) return <Spinner />;
  if (!data || data.items.length === 0) {
    return (
      <EmptyState
        icon="📚"
        title={t("homework.emptyTitle")}
        description={t("homework.emptyText")}
        action={
          <Link to="/dashboard">
            <Button>{t("common:nav.dashboard")}</Button>
          </Link>
        }
      />
    );
  }

  return (
    <>
      <ul className="overflow-hidden rounded-3xl border-2 border-border bg-surface">
        {data.items.map((a) => (
          <li
            key={a.id}
            className="flex flex-col gap-3 border-b-2 border-border px-5 py-4 last:border-b-0 md:flex-row md:items-center"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <Link
                  to={`/assignments/${a.id}`}
                  className="truncate font-display text-lg font-bold hover:text-pop-600"
                >
                  {a.title}
                </Link>
                <Badge tone={a.closed ? "neutral" : "green"}>
                  {a.closed ? t("homework.closed") : t("homework.open")}
                </Badge>
              </div>
              <p className="text-sm text-muted">
                {formatDate(a.createdAt, i18n.language)}
                {a.deadline ? ` · ${t("homework.due", { date: formatDate(a.deadline, i18n.language) })}` : ""}
              </p>
            </div>
            <div className="flex items-center gap-5 text-sm">
              <span>
                <b className="text-base">{a.completedCount}</b>
                <span className="text-muted">
                  /{a.attemptCount} {t("homework.completed")}
                </span>
              </span>
              <span>
                <b className="text-base">{a.averageScore}</b> <span className="text-muted">{t("homework.avg")}</span>
              </span>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                className="rounded-xl p-2 text-muted hover:bg-surface-2 hover:text-fg"
                title={t("homework.copyLink")}
                aria-label={t("homework.copyLink")}
                onClick={async () => {
                  await copyText(a.url);
                  toast.success(t("common:actions.copied"));
                }}
              >
                <Link2 className="size-4" />
              </button>
              <button
                type="button"
                className="rounded-xl p-2 text-muted hover:bg-surface-2 hover:text-fg"
                title={a.closed ? t("homework.reopen") : t("homework.close")}
                aria-label={a.closed ? t("homework.reopen") : t("homework.close")}
                onClick={() => toggle.mutate(a)}
              >
                {a.closed ? <LockOpen className="size-4" /> : <Lock className="size-4" />}
              </button>
              <button
                type="button"
                className="rounded-xl p-2 text-muted hover:bg-surface-2 hover:text-[#e5383b]"
                aria-label={t("common:actions.delete")}
                onClick={() => setToDelete(a)}
              >
                <Trash2 className="size-4" />
              </button>
              <Link
                to={`/assignments/${a.id}`}
                className="rounded-xl p-2 text-muted hover:bg-surface-2 hover:text-fg"
                aria-label={t("reports.open")}
              >
                <ChevronRight className="size-5" />
              </Link>
            </div>
          </li>
        ))}
      </ul>
      <ConfirmDialog
        open={toDelete !== null}
        onClose={() => setToDelete(null)}
        onConfirm={() => toDelete && remove.mutate(toDelete.id)}
        loading={remove.isPending}
        title={t("homework.deleteTitle")}
        description={t("homework.deleteText")}
      />
    </>
  );
}
