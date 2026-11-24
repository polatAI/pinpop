import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CheckCircle2, Download, Lock, LockOpen, Target, Users } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router";
import { toast } from "sonner";
import { CopyBox, PageContainer, PageHeader, StatTile } from "@/components/pages/common";
import { Badge, Button, Card, EmptyState, Spinner } from "@/components/ui";
import { useErrorMessage } from "@/hooks/useErrorMessage";
import { api } from "@/lib/api";
import { cn, formatDate } from "@/lib/utils";
import { type AssignmentReport as Report, SCORED_TYPES } from "@/shared";
import { AccuracyBar } from "./Reports";

function toCsv(report: Report): string {
  const esc = (v: string | number) => `"${String(v).replaceAll('"', '""')}"`;
  const head = ["nickname", "score", "correct", "finished", ...report.questions.map((q, i) => `Q${i + 1}: ${q.text}`)];
  const rows = report.attempts.map((a) => [
    a.nickname,
    a.score,
    a.correctCount,
    a.finished ? "yes" : "no",
    ...a.answers.map((x) =>
      x.timeMs === null ? "-" : `${x.correct === null ? "•" : x.correct ? "✓" : "✗"} ${x.points}`,
    ),
  ]);
  return `﻿${[head, ...rows].map((r) => r.map(esc).join(",")).join("\n")}`;
}

export default function AssignmentReport() {
  const { id = "" } = useParams();
  const { t, i18n } = useTranslation("pages");
  const client = useQueryClient();
  const errorMessage = useErrorMessage();

  const { data, isLoading, isError } = useQuery({
    queryKey: ["assignment-report", id],
    queryFn: () => api.get<Report>(`/api/assignments/${id}`),
    refetchInterval: 15_000,
  });

  const toggle = useMutation({
    mutationFn: () => api.patch(`/api/assignments/${id}`, { closed: !data?.closed }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["assignment-report", id] }),
    onError: (err) => toast.error(errorMessage(err)),
  });

  if (isLoading) return <Spinner className="min-h-[50dvh]" />;
  if (isError || !data) {
    return (
      <PageContainer>
        <EmptyState icon="🔎" title={t("common:errors.not_found")} />
      </PageContainer>
    );
  }

  const finished = data.attempts.filter((a) => a.finished);
  const scoredIdx = data.questions.flatMap((q, i) => (SCORED_TYPES.has(q.type) ? [i] : []));
  const accuracy = (qi: number) => {
    const answered = finished.filter((a) => a.answers[qi]);
    return answered.length ? answered.filter((a) => a.answers[qi]?.correct).length / answered.length : 0;
  };
  const overall =
    scoredIdx.length && finished.length ? scoredIdx.reduce((s, qi) => s + accuracy(qi), 0) / scoredIdx.length : 0;

  const downloadCsv = () => {
    const blob = new Blob([toCsv(data)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pinpop-homework-${data.code}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <PageContainer>
      <Link
        to="/reports?tab=homework"
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-muted hover:text-fg"
      >
        <ArrowLeft className="size-4" /> {t("homework.back")}
      </Link>
      <PageHeader
        title={data.title}
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            <Badge tone={data.closed ? "neutral" : "green"}>
              {data.closed ? t("homework.closed") : t("homework.open")}
            </Badge>
            {data.deadline ? t("homework.due", { date: formatDate(data.deadline, i18n.language) }) : null}
          </span>
        }
        actions={
          <>
            <Button variant="secondary" onClick={() => toggle.mutate()} loading={toggle.isPending}>
              {data.closed ? <LockOpen className="size-4" /> : <Lock className="size-4" />}
              {data.closed ? t("homework.reopen") : t("homework.close")}
            </Button>
            <Button variant="secondary" onClick={downloadCsv} disabled={data.attempts.length === 0}>
              <Download className="size-4" /> CSV
            </Button>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatTile label={t("homework.students")} value={data.attemptCount} icon={<Users className="size-5" />} />
        <StatTile
          label={t("homework.completed")}
          value={data.completedCount}
          icon={<CheckCircle2 className="size-5" />}
          tone="green"
        />
        <StatTile
          label={t("homework.accuracy")}
          value={`${Math.round(overall * 100)}%`}
          icon={<Target className="size-5" />}
          tone="sun"
        />
      </div>

      <Card className="mt-6">
        <CopyBox value={data.url} label={t("homework.shareLink")} />
      </Card>

      {data.attempts.length === 0 ? (
        <div className="mt-6">
          <EmptyState icon="⏳" title={t("homework.noAttempts")} description={t("homework.noAttemptsText")} />
        </div>
      ) : (
        <div className="mt-6 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          <Card className="overflow-x-auto p-0 sm:p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b-2 border-border text-left text-xs tracking-wide text-muted uppercase">
                  <th className="px-5 py-3">#</th>
                  <th className="px-2 py-3">{t("homework.student")}</th>
                  <th className="px-2 py-3 text-right">{t("homework.score")}</th>
                  <th className="px-2 py-3 text-right">{t("homework.correct")}</th>
                  <th className="px-5 py-3">{t("homework.answers")}</th>
                </tr>
              </thead>
              <tbody>
                {data.attempts.map((a, i) => (
                  <tr key={a.id} className="border-b-2 border-border last:border-b-0">
                    <td className="px-5 py-3 font-bold text-muted">{i + 1}</td>
                    <td className="px-2 py-3 font-semibold">
                      {a.nickname}
                      {!a.finished ? <Badge className="ml-2">{t("homework.inProgress")}</Badge> : null}
                    </td>
                    <td className="px-2 py-3 text-right font-bold tabular-nums">{a.score}</td>
                    <td className="px-2 py-3 text-right tabular-nums">
                      {a.correctCount}/{scoredIdx.length}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex flex-wrap gap-1">
                        {a.answers.map((x, qi) => (
                          <span
                            key={qi}
                            title={`Q${qi + 1}`}
                            className={cn(
                              "grid size-6 place-items-center rounded-md text-xs font-bold",
                              x.timeMs === null
                                ? "bg-surface-2 text-muted"
                                : x.correct === null
                                  ? "bg-[#1f9bff]/20 text-[#0b63a8] dark:text-[#7cc4ff]"
                                  : x.correct
                                    ? "bg-[#12b886]/20 text-[#0b7a59] dark:text-[#4fe0b0]"
                                    : "bg-ans-a/20 text-[#c0392b] dark:text-[#ff8a80]",
                            )}
                          >
                            {x.timeMs === null ? "–" : x.correct === null ? "•" : x.correct ? "✓" : "✗"}
                          </span>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
          <Card>
            <h2 className="mb-4 text-lg font-bold">{t("homework.perQuestion")}</h2>
            <ol className="flex flex-col gap-3">
              {data.questions.map((q, qi) => (
                <li key={q.id}>
                  <p className="mb-1 truncate text-sm font-medium">
                    {qi + 1}. {q.text}
                  </p>
                  {SCORED_TYPES.has(q.type) ? (
                    <AccuracyBar value={accuracy(qi)} />
                  ) : (
                    <span className="text-xs text-muted">{t(`common:questionTypes.${q.type}`)}</span>
                  )}
                </li>
              ))}
            </ol>
          </Card>
        </div>
      )}
    </PageContainer>
  );
}
