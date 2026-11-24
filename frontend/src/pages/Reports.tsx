import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronRight, Trash2, Users } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useSearchParams } from "react-router";
import { toast } from "sonner";
import { AssignmentList } from "@/components/pages/AssignmentList";
import { ConfirmDialog } from "@/components/pages/ConfirmDialog";
import { PageContainer, PageHeader } from "@/components/pages/common";
import { Button, EmptyState, Spinner, Tabs } from "@/components/ui";
import { useErrorMessage } from "@/hooks/useErrorMessage";
import { api } from "@/lib/api";
import { cn, formatDate } from "@/lib/utils";
import type { GameReportSummary, Paginated } from "@/shared";

export function AccuracyBar({ value, className }: { value: number; className?: string }) {
  const pct = Math.round(value * 100);
  const color = pct >= 70 ? "bg-[#12b886]" : pct >= 40 ? "bg-sun-500" : "bg-ans-a";
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-surface-2">
        <div className={cn("h-full rounded-full", color)} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-10 text-right text-sm font-bold tabular-nums">{pct}%</span>
    </div>
  );
}

export default function Reports() {
  const { t } = useTranslation("pages");
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") === "homework" ? "homework" : "live";
  return (
    <PageContainer>
      <PageHeader title={t("reports.title")} description={t("reports.subtitle")} />
      <Tabs
        className="mb-6"
        value={tab}
        onChange={(v) => setParams(v === "homework" ? { tab: "homework" } : {}, { replace: true })}
        items={[
          { value: "live", label: t("reports.liveTab") },
          { value: "homework", label: t("reports.homeworkTab") },
        ]}
      />
      {tab === "homework" ? <AssignmentList /> : <LiveReports />}
    </PageContainer>
  );
}

function LiveReports() {
  const { t, i18n } = useTranslation("pages");
  const client = useQueryClient();
  const errorMessage = useErrorMessage();
  const [page, setPage] = useState(1);
  const [toDelete, setToDelete] = useState<GameReportSummary | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["reports", page],
    queryFn: () => api.get<Paginated<GameReportSummary>>(`/api/reports?page=${page}&pageSize=20`),
    placeholderData: keepPreviousData,
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/api/reports/${id}`),
    onSuccess: async () => {
      setToDelete(null);
      toast.success(t("reports.deleted"));
      await client.invalidateQueries({ queryKey: ["reports"] });
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <>
      {isLoading ? (
        <Spinner />
      ) : !data || data.items.length === 0 ? (
        <EmptyState
          icon="📊"
          title={t("reports.emptyTitle")}
          description={t("reports.emptyText")}
          action={
            <Link to="/dashboard">
              <Button>{t("common:nav.dashboard")}</Button>
            </Link>
          }
        />
      ) : (
        <>
          <div className="overflow-hidden rounded-3xl border-2 border-border bg-surface">
            <div className="hidden grid-cols-[2fr_1.2fr_0.7fr_0.7fr_1.2fr_auto] gap-4 border-b-2 border-border px-5 py-3 text-xs font-bold tracking-wide text-muted uppercase md:grid">
              <span>{t("reports.quiz")}</span>
              <span>{t("reports.date")}</span>
              <span>{t("reports.players")}</span>
              <span>{t("reports.questions")}</span>
              <span>{t("reports.accuracy")}</span>
              <span className="w-20" />
            </div>
            <ul>
              {data.items.map((r) => (
                <li key={r.id} className="border-b-2 border-border last:border-b-0">
                  <div className="grid grid-cols-1 items-center gap-2 px-5 py-4 transition-colors hover:bg-surface-2/60 md:grid-cols-[2fr_1.2fr_0.7fr_0.7fr_1.2fr_auto] md:gap-4">
                    <Link
                      to={`/reports/${r.id}`}
                      className="truncate font-display text-lg font-bold hover:text-pop-600"
                    >
                      {r.quizTitle}
                    </Link>
                    <span className="text-sm text-muted">{formatDate(r.startedAt, i18n.language)}</span>
                    <span className="inline-flex items-center gap-1.5 text-sm font-semibold">
                      <Users className="size-4 text-muted md:hidden" />
                      {r.playerCount}
                      <span className="text-muted md:hidden">{t("reports.players").toLowerCase()}</span>
                    </span>
                    <span className="hidden text-sm font-semibold md:inline">{r.questionCount}</span>
                    <AccuracyBar value={r.averageAccuracy} />
                    <div className="flex w-20 items-center justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => setToDelete(r)}
                        className="rounded-xl p-2 text-muted hover:bg-surface-2 hover:text-[#e5383b]"
                        aria-label={t("common:actions.delete")}
                      >
                        <Trash2 className="size-4" />
                      </button>
                      <Link
                        to={`/reports/${r.id}`}
                        className="rounded-xl p-2 text-muted hover:bg-surface-2 hover:text-fg"
                        aria-label={t("reports.open")}
                      >
                        <ChevronRight className="size-5" />
                      </Link>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
          {totalPages > 1 ? (
            <div className="mt-6 flex items-center justify-center gap-3">
              <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                {t("common:actions.back")}
              </Button>
              <span className="text-sm font-semibold text-muted">
                {page} / {totalPages}
              </span>
              <Button variant="secondary" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                {t("common:actions.next")}
              </Button>
            </div>
          ) : null}
        </>
      )}
      <ConfirmDialog
        open={toDelete !== null}
        onClose={() => setToDelete(null)}
        onConfirm={() => toDelete && remove.mutate(toDelete.id)}
        loading={remove.isPending}
        title={t("reports.deleteTitle")}
      />
    </>
  );
}
