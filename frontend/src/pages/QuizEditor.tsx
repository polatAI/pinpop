import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeft, Check, CircleDot, Play, Plus, Settings2, Sparkles } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useBlocker, useNavigate, useParams } from "react-router";
import { toast } from "sonner";
import { GenerateMoreDialog } from "@/components/ai/GenerateMoreDialog";
import { AddQuestionMenu, QuestionTypeGrid as MobileTypeGrid } from "@/components/editor/AddQuestionMenu";
import { duplicateQuestion, makeQuestion, type QuestionIssue, validateQuestion } from "@/components/editor/defaults";
import { QuestionEditor } from "@/components/editor/QuestionEditor";
import { QuestionList } from "@/components/editor/QuestionList";
import { type QuizMeta, QuizSettingsDialog } from "@/components/editor/QuizSettingsDialog";
import { StartGameDialog } from "@/components/game/StartGameDialog";
import { ThemeToggle } from "@/components/layout/AppShell";
import { Button, Dialog, EmptyState, Spinner } from "@/components/ui";
import { LogoMark } from "@/components/ui/Logo";
import { useErrorMessage } from "@/hooks/useErrorMessage";
import { ApiError, api } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { Question, QuestionType, Quiz, Visibility } from "@/shared";

interface DraftQuiz extends QuizMeta {
  title: string;
  questions: Question[];
}

function fromQuiz(q: Quiz): DraftQuiz {
  return {
    title: q.title,
    description: q.description,
    language: q.language,
    visibility: q.visibility,
    tags: q.tags,
    coverImage: q.coverImage,
    questions: q.questions,
  };
}

function emptyDraft(language: string, title: string): DraftQuiz {
  return {
    title,
    description: "",
    language,
    visibility: "private" as Visibility,
    tags: [],
    coverImage: null,
    questions: [makeQuestion("quiz")],
  };
}

const snapshot = (d: DraftQuiz) => JSON.stringify(d);

export default function QuizEditor() {
  const { id } = useParams<{ id: string }>();
  const { t, i18n } = useTranslation("editor");
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const errorMessage = useErrorMessage();

  const query = useQuery({
    queryKey: ["quiz", id],
    queryFn: () => api.get<Quiz>(`/api/quizzes/${id}`),
    enabled: Boolean(id),
  });

  const [draft, setDraft] = useState<DraftQuiz | null>(() =>
    id ? null : emptyDraft(i18n.language.slice(0, 2), t("untitledQuiz")),
  );
  const [saved, setSaved] = useState<string>(() => (draft ? snapshot(draft) : ""));
  const [selectedId, setSelectedId] = useState<string | null>(() => draft?.questions[0]?.id ?? null);
  const [saving, setSaving] = useState(false);
  const [showIssues, setShowIssues] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [hostQuizId, setHostQuizId] = useState<string | null>(null);
  const [isOwner, setIsOwner] = useState(true);
  const skipBlock = useRef(false);

  // Load the server copy once.
  const loadedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!id || !query.data || loadedFor.current === id) return;
    loadedFor.current = id;
    const d = fromQuiz(query.data);
    setDraft(d);
    setSaved(snapshot(d));
    setSelectedId(d.questions[0]?.id ?? null);
    const me = queryClient.getQueryData<{ user: { id: string; role: string } | null }>(["me"])?.user;
    setIsOwner(!me || me.id === query.data.ownerId || me.role === "admin");
  }, [id, query.data, queryClient]);

  const dirty = draft !== null && snapshot(draft) !== saved;
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;

  const issues = useMemo(() => {
    const map = new Map<string, QuestionIssue[]>();
    for (const q of draft?.questions ?? []) {
      const list = validateQuestion(q);
      if (list.length) map.set(q.id, list);
    }
    return map;
  }, [draft?.questions]);
  const invalidIds = useMemo(() => new Set(issues.keys()), [issues]);

  // ---------------------------------------------------------------- mutations of the draft

  const update = useCallback((fn: (d: DraftQuiz) => DraftQuiz) => setDraft((d) => (d ? fn(d) : d)), []);

  const setQuestions = useCallback(
    (fn: (qs: Question[]) => Question[]) => update((d) => ({ ...d, questions: fn(d.questions) })),
    [update],
  );

  function addQuestion(type: QuestionType) {
    if ((draft?.questions.length ?? 0) >= 100) {
      toast.error(t("common:errors.too_many_questions"));
      return;
    }
    const q = makeQuestion(type);
    setQuestions((qs) => {
      const idx = qs.findIndex((x) => x.id === selectedId);
      const next = [...qs];
      next.splice(idx >= 0 ? idx + 1 : qs.length, 0, q);
      return next;
    });
    setSelectedId(q.id);
  }

  function duplicate(qid: string) {
    const src = draft?.questions.find((q) => q.id === qid);
    if (!src) return;
    const copy = duplicateQuestion(src);
    setQuestions((qs) => {
      const idx = qs.findIndex((x) => x.id === qid);
      const next = [...qs];
      next.splice(idx + 1, 0, copy);
      return next;
    });
    setSelectedId(copy.id);
  }

  function remove(qid: string) {
    const qs = draft?.questions ?? [];
    const idx = qs.findIndex((q) => q.id === qid);
    const removed = qs[idx];
    if (!removed) return;
    setQuestions((list) => list.filter((q) => q.id !== qid));
    if (selectedId === qid) setSelectedId(qs[idx + 1]?.id ?? qs[idx - 1]?.id ?? null);
    toast(t("toast.deleted"), {
      action: {
        label: t("toast.undo"),
        onClick: () => {
          setQuestions((list) => {
            const next = [...list];
            next.splice(Math.min(idx, next.length), 0, removed);
            return next;
          });
          setSelectedId(removed.id);
        },
      },
    });
  }

  function replaceQuestion(q: Question) {
    setQuestions((qs) => qs.map((x) => (x.id === q.id ? q : x)));
  }

  // ---------------------------------------------------------------- saving

  const save = useCallback(async (): Promise<string | null> => {
    if (!draft || saving) return null;
    const title = draft.title.trim();
    if (!title) {
      toast.error(t("validation.title"));
      return null;
    }
    if (invalidIds.size > 0) {
      setShowIssues(true);
      const first = draft.questions.findIndex((q) => invalidIds.has(q.id));
      const firstQ = draft.questions[first];
      if (firstQ) setSelectedId(firstQ.id);
      toast.error(t("validation.fixBeforeSave", { count: invalidIds.size, n: first + 1 }));
      return null;
    }
    setSaving(true);
    const payload = { ...draft, title, tags: draft.tags };
    try {
      if (id) {
        const quiz = await api.put<Quiz>(`/api/quizzes/${id}`, payload);
        queryClient.setQueryData(["quiz", id], quiz);
        setSaved(snapshot(draft));
        void queryClient.invalidateQueries({ queryKey: ["quizzes"] });
        return quiz.id;
      }
      const quiz = await api.post<Quiz>("/api/quizzes", payload);
      queryClient.setQueryData(["quiz", quiz.id], quiz);
      void queryClient.invalidateQueries({ queryKey: ["quizzes"] });
      setSaved(snapshot(draft));
      skipBlock.current = true;
      navigate(`/quiz/${quiz.id}/edit`, { replace: true });
      return quiz.id;
    } catch (err) {
      if (err instanceof ApiError && err.code === "invalid_quiz") setShowIssues(true);
      toast.error(errorMessage(err));
      return null;
    } finally {
      setSaving(false);
    }
  }, [draft, saving, invalidIds, id, navigate, queryClient, errorMessage, t]);

  const saveRef = useRef(save);
  saveRef.current = save;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void saveRef.current().then((ok) => ok && toast.success(t("toast.saved")));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [t]);

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (dirtyRef.current) e.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  const blocker = useBlocker(({ currentLocation, nextLocation }) => {
    if (skipBlock.current) {
      skipBlock.current = false;
      return false;
    }
    return dirtyRef.current && currentLocation.pathname !== nextLocation.pathname;
  });

  async function hostLive() {
    const quizId = dirty || !id ? await save() : id;
    if (quizId) setHostQuizId(quizId);
  }

  // ---------------------------------------------------------------- render

  if (id && query.isError) {
    return (
      <div className="mx-auto max-w-xl p-6 pt-20">
        <EmptyState
          icon="🫥"
          title={t("notFound")}
          description={errorMessage(query.error)}
          action={<Button onClick={() => navigate("/dashboard")}>{t("backToDashboard")}</Button>}
        />
      </div>
    );
  }
  if (!draft) return <Spinner className="min-h-dvh" label={t("common:loading")} />;

  const selectedIndex = draft.questions.findIndex((q) => q.id === selectedId);
  const selected = draft.questions[selectedIndex];
  const status = saving ? "saving" : dirty || !id ? "unsaved" : "saved";

  return (
    <div className="flex h-dvh flex-col bg-bg">
      {/* Top bar */}
      <header className="z-30 flex h-16 shrink-0 items-center gap-2 border-b-2 border-border bg-surface px-3 sm:gap-3 sm:px-4">
        <Link
          to="/dashboard"
          className="flex items-center gap-1 rounded-xl p-2 text-muted hover:bg-surface-2 hover:text-fg"
          aria-label={t("backToDashboard")}
          title={t("backToDashboard")}
        >
          <ArrowLeft className="size-5" />
          <LogoMark className="hidden size-7 sm:block" />
        </Link>
        <input
          value={draft.title}
          maxLength={120}
          onChange={(e) => update((d) => ({ ...d, title: e.target.value }))}
          aria-label={t("quizTitle")}
          placeholder={t("quizTitlePlaceholder")}
          className="min-w-0 flex-1 truncate rounded-xl border-2 border-transparent bg-transparent px-2 py-1.5 font-display text-lg font-extrabold hover:border-border focus:border-pop-500 focus:outline-none sm:text-xl"
        />
        <span
          className={cn(
            "hidden items-center gap-1.5 text-sm font-semibold whitespace-nowrap lg:inline-flex",
            status === "saved" ? "text-[#0b7a59] dark:text-[#4fe0b0]" : "text-muted",
          )}
          aria-live="polite"
        >
          {status === "saved" ? <Check className="size-4" /> : <CircleDot className="size-4" />}
          {t(`status.${status}`)}
        </span>
        <Button variant="ghost" size="sm" onClick={() => setSettingsOpen(true)} aria-label={t("settings.title")}>
          <Settings2 className="size-4" />
          <span className="hidden md:inline">{t("settings.button")}</span>
        </Button>
        <ThemeToggle className="hidden sm:inline-flex" />
        <Button
          variant="secondary"
          size="sm"
          onClick={() => void save().then((ok) => ok && toast.success(t("toast.saved")))}
          loading={saving}
          disabled={!dirty && Boolean(id)}
        >
          <span className="hidden sm:inline">{t("common:actions.save")}</span>
          <Check className="size-4 sm:hidden" />
        </Button>
        <Button size="sm" onClick={() => void hostLive()} disabled={saving || draft.questions.length === 0}>
          <Play className="size-4" />
          <span className="hidden sm:inline">{t("common:actions.host")}</span>
        </Button>
      </header>

      {!isOwner ? (
        <div className="flex items-center gap-2 bg-sun-400/30 px-4 py-2 text-sm font-semibold">
          <AlertTriangle className="size-4" /> {t("notOwner")}
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1">
        {/* Sidebar (desktop) */}
        <aside className="hidden w-80 shrink-0 flex-col border-r-2 border-border bg-surface/60 md:flex">
          <div className="flex items-center justify-between px-4 pt-4 pb-2">
            <h2 className="text-sm font-bold tracking-wide text-muted uppercase">
              {t("common:questions", { count: draft.questions.length })}
            </h2>
            <button
              type="button"
              onClick={() => setMoreOpen(true)}
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-bold text-pop-600 hover:bg-pop-50 dark:text-pop-300 dark:hover:bg-pop-900/30"
            >
              <Sparkles className="size-3.5" /> {t("aiGen.moreShort")}
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
            <QuestionList
              questions={draft.questions}
              selectedId={selectedId}
              invalidIds={invalidIds}
              onSelect={setSelectedId}
              onReorder={(qs) => setQuestions(() => qs)}
              onDuplicate={duplicate}
              onDelete={remove}
            />
          </div>
          <div className="border-t-2 border-border p-3">
            <AddQuestionMenu onAdd={addQuestion} />
          </div>
        </aside>

        <main className="flex min-w-0 flex-1 flex-col">
          {/* Question strip (mobile) */}
          <div className="flex items-center gap-2 border-b-2 border-border bg-surface/60 px-2 py-2 md:hidden">
            <div className="min-w-0 flex-1">
              <QuestionList
                orientation="horizontal"
                questions={draft.questions}
                selectedId={selectedId}
                invalidIds={invalidIds}
                onSelect={setSelectedId}
                onReorder={(qs) => setQuestions(() => qs)}
                onDuplicate={duplicate}
                onDelete={remove}
              />
            </div>
            <MobileAdd onAdd={addQuestion} onAi={() => setMoreOpen(true)} />
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-3 py-5 sm:px-6 sm:py-8">
            <AnimatePresence mode="wait">
              {selected ? (
                <motion.div
                  key={selected.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.15 }}
                >
                  <QuestionEditor
                    question={selected}
                    index={selectedIndex}
                    issues={issues.get(selected.id) ?? []}
                    showIssues={showIssues}
                    onChange={replaceQuestion}
                    onReplace={replaceQuestion}
                    onDuplicate={() => duplicate(selected.id)}
                    onDelete={() => remove(selected.id)}
                  />
                </motion.div>
              ) : (
                <motion.div
                  key="empty"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="mx-auto max-w-xl pt-10"
                >
                  <EmptyState
                    icon="✨"
                    title={t("empty.title")}
                    description={t("empty.description")}
                    action={
                      <div className="flex flex-col items-center gap-3 sm:flex-row">
                        <AddQuestionMenu onAdd={addQuestion} placement="bottom" />
                        <Button variant="secondary" onClick={() => setMoreOpen(true)}>
                          <Sparkles className="size-4 text-pop-500" /> {t("aiGen.moreShort")}
                        </Button>
                      </div>
                    }
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </main>
      </div>

      <QuizSettingsDialog
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        value={draft}
        onChange={(patch) => update((d) => ({ ...d, ...patch }))}
      />

      <GenerateMoreDialog
        open={moreOpen}
        onClose={() => setMoreOpen(false)}
        quizTitle={draft.title}
        quizDescription={draft.description}
        language={draft.language}
        existing={draft.questions}
        onGenerated={(qs) => {
          setQuestions((list) => [...list, ...qs].slice(0, 100));
          const first = qs[0];
          if (first) setSelectedId(first.id);
        }}
      />

      <StartGameDialog quizId={hostQuizId} open={hostQuizId !== null} onClose={() => setHostQuizId(null)} />

      <Dialog
        open={blocker.state === "blocked"}
        onClose={() => blocker.reset?.()}
        size="sm"
        title={t("leave.title")}
        description={t("leave.description")}
        footer={
          <>
            <Button variant="ghost" onClick={() => blocker.proceed?.()}>
              {t("leave.discard")}
            </Button>
            <Button
              onClick={async () => {
                const ok = await save();
                if (ok) blocker.proceed?.();
                else blocker.reset?.();
              }}
              loading={saving}
            >
              {t("leave.save")}
            </Button>
          </>
        }
      />
    </div>
  );
}

function MobileAdd({ onAdd, onAi }: { onAdd: (type: QuestionType) => void; onAi: () => void }) {
  const { t } = useTranslation("editor");
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="icon" onClick={() => setOpen(true)} aria-label={t("list.addQuestion")}>
        <Plus className="size-5" />
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title={t("list.addQuestion")} size="md">
        <div className="space-y-3">
          <MobileTypeGrid
            onPick={(type) => {
              setOpen(false);
              onAdd(type);
            }}
          />
          <Button
            variant="secondary"
            className="w-full"
            onClick={() => {
              setOpen(false);
              onAi();
            }}
          >
            <Sparkles className="size-4 text-pop-500" /> {t("aiGen.moreShort")}
          </Button>
        </div>
      </Dialog>
    </>
  );
}
