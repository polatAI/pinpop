import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Calendar, ChevronDown, Download, HelpCircle, Target, Timer, Users } from "lucide-react";
import { Fragment, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router";
import { PageContainer, PageHeader, StatTile } from "@/components/pages/common";
import { Badge, Button, EmptyState, Spinner } from "@/components/ui";
import { api, download } from "@/lib/api";
import { cn, formatDate, formatNumber } from "@/lib/utils";
import { type GameReport, SCORED_TYPES } from "@/shared";
import { AccuracyBar } from "./Reports";

function durationLabel(startIso: string, endIso: string | null): string | null {
  if (!endIso) return null;
  const secs = Math.max(0, Math.round((new Date(endIso).getTime() - new Date(startIso).getTime()) / 1000));
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

export default function ReportDetail() {
  const { id = "" } = useParams();
  const { t, i18n } = useTranslation("pages");
  const [expanded, setExpanded] = useState<string | null>(null);

  const { data: report, isLoading } = useQuery({
    queryKey: ["report", id],
    queryFn: () => api.get<GameReport>(`/api/reports/${id}`),
  });

  const perQuestion = useMemo(() => {
    if (!report) return [];
    return report.questions.map((q, i) => {
      const answers = report.players.map((p) => p.answers[i]).filter((a) => a && a.timeMs !== null);
      const correct = answers.filter((a) => a?.correct === true).length;
      const times = answers.map((a) => a?.timeMs ?? 0);
      const scored = SCORED_TYPES.has(q.type);
      return {
        question: q,
        index: i,
        scored,
        answered: answers.length,
        accuracy: scored && report.players.length > 0 ? correct / report.players.length : null,
        avgTime: times.length ? times.reduce((a, b) => a + b, 0) / times.length / 1000 : null,
      };
    });
  }, [report]);

  const hardest = useMemo(() => {
    const scored = perQuestion.filter((p) => p.accuracy !== null);
    if (scored.length < 2) return new Set<number>();
    return new Set(
      [...scored]
        .sort((a, b) => (a.accuracy ?? 0) - (b.accuracy ?? 0))
        .slice(0, Math.min(3, Math.ceil(scored.length / 4)))
        .filter((p) => (p.accuracy ?? 1) < 0.6)
        .map((p) => p.index),
    );
  }, [perQuestion]);

  if (isLoading) return <Spinner className="min-h-[50dvh]" />;
  if (!report) {
    return (
      <PageContainer>
        <EmptyState
          icon="📭"
          title={t("reportDetail.notFound")}
          action={
            <Link to="/reports">
              <Button variant="secondary">{t("reports.title")}</Button>
            </Link>
          }
        />
      </PageContainer>
    );
  }

  const scoredCount = report.questions.filter((q) => SCORED_TYPES.has(q.type)).length;
  const duration = durationLabel(report.startedAt, report.endedAt);

  return (
    <PageContainer>
      <Link
        to="/reports"
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-muted hover:text-fg"
      >
        <ArrowLeft className="size-4" /> {t("reports.title")}
      </Link>
      <PageHeader
        title={report.quizTitle}
        description={t("reportDetail.subtitle", { date: formatDate(report.startedAt, i18n.language), pin: report.pin })}
        actions={
          <Button variant="secondary" onClick={() => download(`/api/reports/${report.id}/csv`)}>
            <Download className="size-4" /> {t("reportDetail.downloadCsv")}
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label={t("reports.players")}
          value={formatNumber(report.playerCount, i18n.language)}
          icon={<Users className="size-6" />}
          tone="pop"
        />
        <StatTile
          label={t("reports.questions")}
          value={report.questionCount}
          icon={<HelpCircle className="size-6" />}
          tone="blue"
        />
        <StatTile
          label={t("reports.accuracy")}
          value={`${Math.round(report.averageAccuracy * 100)}%`}
          icon={<Target className="size-6" />}
          tone="green"
        />
        <StatTile
          label={duration ? t("reportDetail.duration") : t("reports.date")}
          value={duration ?? formatDate(report.startedAt, i18n.language)}
          icon={duration ? <Timer className="size-6" /> : <Calendar className="size-6" />}
          tone="sun"
        />
      </div>

      <div className="mt-10 grid gap-8 lg:grid-cols-[1.1fr_1fr]">
        {/* Leaderboard */}
        <section>
          <h2 className="mb-4 text-2xl font-extrabold">{t("reportDetail.leaderboard")}</h2>
          {report.players.length === 0 ? (
            <EmptyState icon="🦗" title={t("reportDetail.noPlayers")} />
          ) : (
            <div className="overflow-hidden rounded-3xl border-2 border-border bg-surface">
              <table className="w-full text-left">
                <thead className="border-b-2 border-border text-xs font-bold tracking-wide text-muted uppercase">
                  <tr>
                    <th className="px-4 py-3">#</th>
                    <th className="px-2 py-3">{t("reportDetail.player")}</th>
                    <th className="px-2 py-3 text-right">{t("reportDetail.score")}</th>
                    <th className="px-2 py-3 text-right">{t("reportDetail.correct")}</th>
                    <th className="w-10 px-2 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {report.players.map((p) => {
                    const key = `${p.rank}-${p.nickname}`;
                    const open = expanded === key;
                    return (
                      <Fragment key={key}>
                        <tr
                          className="cursor-pointer border-b-2 border-border last:border-b-0 hover:bg-surface-2/60"
                          onClick={() => setExpanded(open ? null : key)}
                        >
                          <td className="px-4 py-3">
                            <span
                              className={cn(
                                "grid size-8 place-items-center rounded-xl font-display font-extrabold",
                                p.rank === 1
                                  ? "bg-sun-400 text-ink-900"
                                  : p.rank === 2
                                    ? "bg-[#d9dde6] text-ink-900"
                                    : p.rank === 3
                                      ? "bg-[#f0b27a] text-ink-900"
                                      : "bg-surface-2",
                              )}
                            >
                              {p.rank}
                            </span>
                          </td>
                          <td className="px-2 py-3">
                            <span className="mr-2 text-xl">{p.avatar}</span>
                            <span className="font-semibold">{p.nickname}</span>
                          </td>
                          <td className="px-2 py-3 text-right font-bold tabular-nums">
                            {formatNumber(p.score, i18n.language)}
                          </td>
                          <td className="px-2 py-3 text-right text-sm text-muted tabular-nums">
                            {p.correctCount}/{scoredCount}
                          </td>
                          <td className="px-2 py-3">
                            <ChevronDown
                              className={cn("size-4 text-muted transition-transform", open && "rotate-180")}
                            />
                          </td>
                        </tr>
                        {open ? (
                          <tr className="border-b-2 border-border bg-surface-2/40">
                            <td colSpan={5} className="px-4 py-3">
                              <div className="flex flex-wrap gap-1.5">
                                {report.questions.map((q, i) => {
                                  const a = p.answers[i];
                                  const missed = !a || a.timeMs === null;
                                  const mark = missed ? "–" : a.correct === null ? "•" : a.correct ? "✓" : "✗";
                                  return (
                                    <span
                                      key={q.id}
                                      title={`${i + 1}. ${q.text}${a && !missed ? ` · ${a.points} pts · ${((a.timeMs ?? 0) / 1000).toFixed(1)}s` : ""}`}
                                      className={cn(
                                        "grid size-9 place-items-center rounded-xl text-sm font-bold",
                                        missed
                                          ? "bg-surface text-muted"
                                          : a.correct === null
                                            ? "bg-[#1f9bff]/15 text-[#0b63a8] dark:text-[#7cc4ff]"
                                            : a.correct
                                              ? "bg-[#12b886]/20 text-[#0b7a59] dark:text-[#4fe0b0]"
                                              : "bg-ans-a/20 text-[#c0392b] dark:text-[#ff8f86]",
                                      )}
                                    >
                                      {mark}
                                    </span>
                                  );
                                })}
                              </div>
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Per question */}
        <section>
          <h2 className="mb-4 text-2xl font-extrabold">{t("reportDetail.perQuestion")}</h2>
          <ol className="flex flex-col gap-3">
            {perQuestion.map((pq) => (
              <li
                key={pq.question.id}
                className={cn(
                  "rounded-3xl border-2 bg-surface p-4",
                  hardest.has(pq.index) ? "border-ans-a" : "border-border",
                )}
              >
                <div className="mb-2 flex items-start gap-3">
                  <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-ink-900 text-sm font-bold text-white dark:bg-white dark:text-ink-900">
                    {pq.index + 1}
                  </span>
                  <p className="flex-1 font-semibold">{pq.question.text}</p>
                  {hardest.has(pq.index) ? <Badge tone="pop">{t("reportDetail.hardest")}</Badge> : null}
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pl-10">
                  {pq.accuracy !== null ? (
                    <AccuracyBar value={pq.accuracy} className="min-w-40 flex-1" />
                  ) : (
                    <Badge tone="blue">{t(`common:questionTypes.${pq.question.type}`)}</Badge>
                  )}
                  <span className="text-xs text-muted">
                    {t("reportDetail.answered", { count: pq.answered, total: report.players.length })}
                    {pq.avgTime !== null ? ` · ${t("reportDetail.avgTime", { seconds: pq.avgTime.toFixed(1) })}` : ""}
                  </span>
                </div>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </PageContainer>
  );
}
