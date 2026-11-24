import { useQuery } from "@tanstack/react-query";
import { Copy, Download, Eye, EyeOff, Pencil, Play } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "react-router";
import { toast } from "sonner";
import { StartGameDialog } from "@/components/game/StartGameDialog";
import { PageContainer, QuestionPreview, QuizCover } from "@/components/pages/common";
import { Badge, Button, EmptyState, Spinner } from "@/components/ui";
import { useAuth } from "@/hooks/useAuth";
import { useErrorMessage } from "@/hooks/useErrorMessage";
import { ApiError, api, download } from "@/lib/api";
import { formatDate } from "@/lib/utils";
import type { Quiz } from "@/shared";

export default function QuizDetail() {
  const { id = "" } = useParams();
  const { t, i18n } = useTranslation("pages");
  const { user } = useAuth();
  const navigate = useNavigate();
  const errorMessage = useErrorMessage();
  const [showAnswers, setShowAnswers] = useState(false);
  const [hostOpen, setHostOpen] = useState(false);
  const [forking, setForking] = useState(false);

  const {
    data: quiz,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["quiz", id],
    queryFn: () => api.get<Quiz>(`/api/quizzes/${id}`),
  });

  if (isLoading) return <Spinner className="min-h-[50dvh]" />;
  if (!quiz) {
    const notFound = error instanceof ApiError && (error.status === 404 || error.status === 403);
    return (
      <PageContainer>
        <EmptyState
          icon="🕵️"
          title={notFound ? t("detail.notFound") : t("common:errors.generic")}
          description={notFound ? t("detail.notFoundText") : undefined}
          action={
            <Link to="/discover">
              <Button variant="secondary">{t("common:nav.discover")}</Button>
            </Link>
          }
        />
      </PageContainer>
    );
  }

  const isOwner = user?.id === quiz.ownerId;

  const fork = async () => {
    if (!user) {
      navigate(`/login?next=${encodeURIComponent(`/quiz/${quiz.id}`)}`);
      return;
    }
    setForking(true);
    try {
      const copy = await api.post<Quiz>(`/api/quizzes/${quiz.id}/fork`);
      toast.success(t("detail.copied"));
      navigate(`/quiz/${copy.id}/edit`);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setForking(false);
    }
  };

  const host = () => {
    if (!user) navigate(`/login?next=${encodeURIComponent(`/quiz/${quiz.id}`)}`);
    else setHostOpen(true);
  };

  return (
    <PageContainer className="max-w-5xl">
      <div className="overflow-hidden rounded-[2rem] border-2 border-ink-900 bg-surface shadow-pop dark:border-ink-600">
        <QuizCover quiz={quiz} className="aspect-[16/6] min-h-40" />
        <div className="flex flex-col gap-5 p-6 sm:p-8">
          <div className="flex flex-wrap gap-2">
            <Badge tone="pop">{t(`common:visibility.${quiz.visibility}`)}</Badge>
            <Badge>{quiz.language.toUpperCase()}</Badge>
            <Badge tone="blue">{t("common:questions", { count: quiz.questions.length })}</Badge>
            <Badge tone="sun">{t("common:plays", { count: quiz.playCount })}</Badge>
          </div>
          <div>
            <h1 className="text-3xl font-extrabold text-balance sm:text-4xl">{quiz.title}</h1>
            <p className="mt-2 text-sm text-muted">
              {quiz.ownerName ? `${t("common:by", { name: quiz.ownerName })} · ` : ""}
              {t("detail.updated", { date: formatDate(quiz.updatedAt, i18n.language) })}
            </p>
            {quiz.description ? <p className="mt-4 max-w-3xl text-lg whitespace-pre-line">{quiz.description}</p> : null}
          </div>
          {quiz.tags.length ? (
            <div className="flex flex-wrap gap-2">
              {quiz.tags.map((tg) => (
                <Link
                  key={tg}
                  to={`/discover?tag=${encodeURIComponent(tg)}`}
                  className="rounded-full bg-surface-2 px-3 py-1 text-sm font-semibold text-muted hover:text-fg"
                >
                  #{tg}
                </Link>
              ))}
            </div>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button size="lg" onClick={host} disabled={quiz.questions.length === 0}>
              <Play className="size-5" /> {t("common:actions.host")}
            </Button>
            {isOwner ? (
              <Button variant="secondary" size="lg" onClick={() => navigate(`/quiz/${quiz.id}/edit`)}>
                <Pencil className="size-4" /> {t("common:actions.edit")}
              </Button>
            ) : null}
            <Button variant="secondary" size="lg" onClick={fork} loading={forking}>
              <Copy className="size-4" /> {t("detail.copyToMine")}
            </Button>
            <Button variant="ghost" size="lg" onClick={() => download(`/api/quizzes/${quiz.id}/export?format=json`)}>
              <Download className="size-4" /> {t("common:actions.export")}
            </Button>
          </div>
        </div>
      </div>

      <div className="mt-10 mb-4 flex items-center justify-between gap-4">
        <h2 className="text-2xl font-extrabold">{t("detail.questions")}</h2>
        <Button variant="secondary" size="sm" onClick={() => setShowAnswers((v) => !v)}>
          {showAnswers ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          {showAnswers ? t("detail.hideAnswers") : t("detail.showAnswers")}
        </Button>
      </div>
      {quiz.questions.length === 0 ? (
        <EmptyState icon="📝" title={t("detail.noQuestions")} />
      ) : (
        <div className="flex flex-col gap-4">
          {quiz.questions.map((q, i) => (
            <QuestionPreview key={q.id} question={q} index={i} showAnswers={showAnswers} />
          ))}
        </div>
      )}
      <StartGameDialog quizId={hostOpen ? quiz.id : null} open={hostOpen} onClose={() => setHostOpen(false)} />
    </PageContainer>
  );
}
