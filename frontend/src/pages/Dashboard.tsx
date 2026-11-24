import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ClipboardList,
  Copy,
  Download,
  MoreHorizontal,
  Pencil,
  Play,
  Plus,
  Search,
  Sparkles,
  Trash2,
  Upload,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { AiGenerateDialog } from "@/components/ai/AiGenerateDialog";
import { StartGameDialog } from "@/components/game/StartGameDialog";
import { AssignDialog } from "@/components/pages/AssignDialog";
import { ConfirmDialog } from "@/components/pages/ConfirmDialog";
import { PageContainer, PageHeader, QuizCard } from "@/components/pages/common";
import { ImportDialog } from "@/components/pages/ImportDialog";
import { Button, EmptyState, Input, Spinner } from "@/components/ui";
import { useAuth } from "@/hooks/useAuth";
import { useErrorMessage } from "@/hooks/useErrorMessage";
import { api, download } from "@/lib/api";
import type { Paginated, QuizSummary } from "@/shared";

function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}

function CardMenu({ quiz, onDelete, onAssign }: { quiz: QuizSummary; onDelete: () => void; onAssign: () => void }) {
  const { t } = useTranslation("pages");
  const navigate = useNavigate();
  const client = useQueryClient();
  const errorMessage = useErrorMessage();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const duplicate = async () => {
    setOpen(false);
    try {
      const copy = await api.post<QuizSummary>(`/api/quizzes/${quiz.id}/fork`);
      await client.invalidateQueries({ queryKey: ["quizzes"] });
      toast.success(t("dashboard.duplicated"));
      navigate(`/quiz/${copy.id}/edit`);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const item = "flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-medium hover:bg-surface-2";
  return (
    <div ref={ref} className="relative">
      <Button
        variant="secondary"
        size="icon"
        className="size-9"
        onClick={() => setOpen((v) => !v)}
        aria-label={t("dashboard.more")}
        aria-expanded={open}
      >
        <MoreHorizontal className="size-4" />
      </Button>
      {open ? (
        <div className="absolute right-0 bottom-11 z-20 w-52 rounded-2xl border-2 border-ink-900 bg-surface p-1.5 shadow-pop dark:border-ink-600">
          <button
            type="button"
            className={item}
            disabled={quiz.questionCount === 0}
            onClick={() => {
              setOpen(false);
              onAssign();
            }}
          >
            <ClipboardList className="size-4" /> {t("dashboard.assign")}
          </button>
          <button type="button" className={item} onClick={duplicate}>
            <Copy className="size-4" /> {t("common:actions.duplicate")}
          </button>
          <button
            type="button"
            className={item}
            onClick={() => {
              setOpen(false);
              download(`/api/quizzes/${quiz.id}/export?format=json`);
            }}
          >
            <Download className="size-4" /> {t("dashboard.exportJson")}
          </button>
          <button
            type="button"
            className={item}
            onClick={() => {
              setOpen(false);
              download(`/api/quizzes/${quiz.id}/export?format=csv`);
            }}
          >
            <Download className="size-4" /> {t("dashboard.exportCsv")}
          </button>
          <button
            type="button"
            className={`${item} text-[#e5383b]`}
            onClick={() => {
              setOpen(false);
              onDelete();
            }}
          >
            <Trash2 className="size-4" /> {t("common:actions.delete")}
          </button>
        </div>
      ) : null}
    </div>
  );
}

export default function Dashboard() {
  const { t } = useTranslation("pages");
  const { user } = useAuth();
  const navigate = useNavigate();
  const client = useQueryClient();
  const errorMessage = useErrorMessage();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const q = useDebounced(search.trim());
  const [aiOpen, setAiOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [hostQuiz, setHostQuiz] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<QuizSummary | null>(null);
  const [toAssign, setToAssign] = useState<QuizSummary | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: reset to the first page whenever the search changes
  useEffect(() => setPage(1), [q]);

  const { data, isLoading } = useQuery({
    queryKey: ["quizzes", q, page],
    queryFn: () =>
      api.get<Paginated<QuizSummary>>(`/api/quizzes?${new URLSearchParams({ q, page: String(page), pageSize: "24" })}`),
    placeholderData: keepPreviousData,
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/api/quizzes/${id}`),
    onSuccess: async () => {
      setToDelete(null);
      toast.success(t("dashboard.deleted"));
      await client.invalidateQueries({ queryKey: ["quizzes"] });
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const firstName = user?.name.split(" ")[0] ?? "";

  return (
    <PageContainer>
      <PageHeader
        title={t("dashboard.greeting", { name: firstName })}
        description={t("dashboard.subtitle")}
        actions={
          <>
            <Button variant="secondary" onClick={() => setImportOpen(true)}>
              <Upload className="size-4" /> {t("common:actions.import")}
            </Button>
            <Button variant="sun" onClick={() => setAiOpen(true)}>
              <Sparkles className="size-4" /> {t("dashboard.generateAi")}
            </Button>
            <Button onClick={() => navigate("/quiz/new")}>
              <Plus className="size-4" /> {t("dashboard.newQuiz")}
            </Button>
          </>
        }
      />

      <div className="relative mb-6 max-w-md">
        <Search className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted" />
        <Input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("dashboard.searchPlaceholder")}
          className="pl-11"
          aria-label={t("common:actions.search")}
        />
      </div>

      {isLoading ? (
        <Spinner />
      ) : !data || data.items.length === 0 ? (
        q ? (
          <EmptyState icon="🔍" title={t("dashboard.noResults")} description={t("dashboard.noResultsHint")} />
        ) : (
          <EmptyState
            icon="🎈"
            title={t("dashboard.emptyTitle")}
            description={t("dashboard.emptyText")}
            action={
              <div className="flex flex-wrap justify-center gap-3">
                <Button onClick={() => navigate("/quiz/new")}>
                  <Plus className="size-4" /> {t("dashboard.newQuiz")}
                </Button>
                <Button variant="sun" onClick={() => setAiOpen(true)}>
                  <Sparkles className="size-4" /> {t("dashboard.generateAi")}
                </Button>
              </div>
            }
          />
        )
      ) : (
        <>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {data.items.map((quiz) => (
              <QuizCard
                key={quiz.id}
                quiz={{ ...quiz, ownerName: null }}
                to={`/quiz/${quiz.id}`}
                actions={
                  <>
                    <Button
                      size="sm"
                      className="flex-1"
                      onClick={() => setHostQuiz(quiz.id)}
                      disabled={quiz.questionCount === 0}
                    >
                      <Play className="size-4" /> {t("common:actions.host")}
                    </Button>
                    <Button
                      variant="secondary"
                      size="icon"
                      className="size-9"
                      onClick={() => navigate(`/quiz/${quiz.id}/edit`)}
                      aria-label={t("common:actions.edit")}
                      title={t("common:actions.edit")}
                    >
                      <Pencil className="size-4" />
                    </Button>
                    <CardMenu quiz={quiz} onDelete={() => setToDelete(quiz)} onAssign={() => setToAssign(quiz)} />
                  </>
                }
              />
            ))}
          </div>
          {totalPages > 1 ? (
            <div className="mt-8 flex items-center justify-center gap-3">
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

      <AiGenerateDialog open={aiOpen} onClose={() => setAiOpen(false)} />
      <ImportDialog open={importOpen} onClose={() => setImportOpen(false)} />
      <AssignDialog quiz={toAssign} onClose={() => setToAssign(null)} />
      <StartGameDialog quizId={hostQuiz} open={hostQuiz !== null} onClose={() => setHostQuiz(null)} />
      <ConfirmDialog
        open={toDelete !== null}
        onClose={() => setToDelete(null)}
        onConfirm={() => toDelete && remove.mutate(toDelete.id)}
        loading={remove.isPending}
        title={t("dashboard.deleteTitle", { title: toDelete?.title ?? "" })}
      />
    </PageContainer>
  );
}
