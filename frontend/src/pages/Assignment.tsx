import { useQuery } from "@tanstack/react-query";
import { CalendarClock, Flame, Lock, Trophy } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router";
import { GameBackdrop } from "@/components/game/Backdrop";
import { TimeBar } from "@/components/game/Countdown";
import { celebrate } from "@/components/game/confetti";
import { PlayerAnswer } from "@/components/game/PlayerAnswer";
import { SolutionSummary } from "@/components/game/Solution";
import { LanguageSwitcher, ThemeToggle } from "@/components/layout/AppShell";
import { Button, Card, Input, Spinner } from "@/components/ui";
import { Logo } from "@/components/ui/Logo";
import { useErrorMessage } from "@/hooks/useErrorMessage";
import { api } from "@/lib/api";
import { sound } from "@/lib/sound";
import { cn, formatDate, storage } from "@/lib/utils";
import type { Answer, AssignmentInfo, Question, SoloAnswerResult, SoloQuestionPayload } from "@/shared";

interface Stored {
  token: string;
  nickname: string;
}

type Stage =
  | { kind: "start" }
  | { kind: "loading" }
  | { kind: "question"; payload: SoloQuestionPayload; startedAt: number }
  | { kind: "result"; result: SoloAnswerResult; total: number }
  | { kind: "finished"; score: number; correctCount: number; total: number };

const storeKey = (code: string) => `pinpop:assign:${code.toUpperCase()}`;

/** Self-paced homework: one student plays a quiz alone through a share link. */
export default function Assignment() {
  const { code = "" } = useParams();
  const { t, i18n } = useTranslation("game");
  const errorMessage = useErrorMessage();
  const [stage, setStage] = useState<Stage>({ kind: "loading" });
  const [nickname, setNickname] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const stored = useRef<Stored | null>(storage.getJSON<Stored>(storeKey(code)));

  const info = useQuery({
    queryKey: ["assignment", code],
    queryFn: () => api.get<AssignmentInfo>(`/api/play/${code}`),
    retry: false,
  });

  const fetchNext = useCallback(async () => {
    const token = stored.current?.token;
    if (!token) return;
    setStage({ kind: "loading" });
    const res = await api.post<{ question: SoloQuestionPayload; elapsedMs: number }>(`/api/play/${code}/next`, {
      token,
    });
    setStage({ kind: "question", payload: res.question, startedAt: Date.now() - res.elapsedMs });
  }, [code]);

  // Resume an attempt after a reload.
  useEffect(() => {
    const token = stored.current?.token;
    if (!token) {
      setStage({ kind: "start" });
      return;
    }
    api
      .post<{
        finished: boolean;
        score: number;
        streak: number;
        correctCount: number;
        question: SoloQuestionPayload | null;
        elapsedMs: number;
      }>(`/api/play/${code}/state`, { token })
      .then(async (s) => {
        setScore(s.score);
        setStreak(s.streak);
        if (s.finished) {
          setStage({
            kind: "finished",
            score: s.score,
            correctCount: s.correctCount,
            total: info.data?.questionCount ?? 0,
          });
        } else if (s.question) {
          setStage({ kind: "question", payload: s.question, startedAt: Date.now() - s.elapsedMs });
        } else {
          await fetchNext();
        }
      })
      .catch(() => {
        storage.remove(storeKey(code));
        stored.current = null;
        setStage({ kind: "start" });
      });
  }, [code, fetchNext, info.data?.questionCount]);

  const start = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<{ token: string; question: SoloQuestionPayload }>(`/api/play/${code}/start`, {
        nickname,
      });
      stored.current = { token: res.token, nickname };
      storage.setJSON(storeKey(code), stored.current);
      sound.start();
      setStage({ kind: "question", payload: res.question, startedAt: Date.now() });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const submit = useCallback(
    async (answer: Answer | null) => {
      if (stage.kind !== "question" || !stored.current) return;
      const total = stage.payload.total;
      setBusy(true);
      try {
        const result = await api.post<SoloAnswerResult>(`/api/play/${code}/answer`, {
          token: stored.current.token,
          questionIndex: stage.payload.index,
          answer,
        });
        setScore(result.score);
        setStreak(result.streak);
        if (result.correct === true) sound.correct();
        else if (result.correct === false) sound.wrong();
        else sound.answer();
        navigator.vibrate?.(result.correct ? 40 : [30, 40, 30]);
        setStage({ kind: "result", result, total });
      } catch (err) {
        setError(errorMessage(err));
      } finally {
        setBusy(false);
      }
    },
    [stage, code, errorMessage],
  );

  const restart = () => {
    storage.remove(storeKey(code));
    stored.current = null;
    setScore(0);
    setStreak(0);
    setStage({ kind: "start" });
  };

  useEffect(() => {
    if (stage.kind === "finished" && stage.total > 0 && stage.correctCount / stage.total >= 0.6) {
      celebrate();
      sound.fanfare();
    }
  }, [stage]);

  if (info.isLoading) return <Spinner className="min-h-dvh" />;
  if (info.isError || !info.data) {
    return (
      <Shell>
        <Card className="max-w-md text-center">
          <h1 className="text-2xl font-bold">{t("assignment.notFound")}</h1>
          <p className="mt-2 text-muted">{t("assignment.notFoundText")}</p>
          <Link to="/" className="mt-6 inline-block font-semibold text-pop-600">
            {t("assignment.home")}
          </Link>
        </Card>
      </Shell>
    );
  }
  const a = info.data;

  return (
    <Shell title={a.title} score={stage.kind === "start" ? null : score} streak={streak}>
      {stage.kind === "loading" ? <Spinner /> : null}

      {stage.kind === "start" ? (
        <Card className="w-full max-w-md">
          <p className="text-sm font-semibold tracking-wide text-pop-600 uppercase">{t("assignment.badge")}</p>
          <h1 className="mt-1 text-3xl font-extrabold text-balance">{a.title}</h1>
          <p className="mt-2 text-muted">{t("assignment.meta", { count: a.questionCount, owner: a.ownerName })}</p>
          {a.deadline ? (
            <p className="mt-3 inline-flex items-center gap-2 rounded-xl bg-surface-2 px-3 py-1.5 text-sm font-medium">
              <CalendarClock className="size-4" />{" "}
              {t("assignment.deadline", { date: formatDate(a.deadline, i18n.language) })}
            </p>
          ) : null}
          {a.open ? (
            <form
              className="mt-6 flex flex-col gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                void start();
              }}
            >
              <label htmlFor="nick" className="font-semibold">
                {t("assignment.yourName")}
              </label>
              <Input
                id="nick"
                value={nickname}
                maxLength={20}
                autoFocus
                placeholder={t("assignment.namePlaceholder")}
                onChange={(e) => setNickname(e.target.value)}
                className="h-13 text-lg"
              />
              {error ? <p className="text-sm font-medium text-[#e5383b]">{error}</p> : null}
              <Button type="submit" size="lg" loading={busy} disabled={!nickname.trim()}>
                {t("assignment.start")}
              </Button>
              <p className="text-center text-xs text-muted">{t("assignment.timerNote")}</p>
            </form>
          ) : (
            <div className="mt-6 flex items-center gap-3 rounded-2xl bg-surface-2 p-4 font-semibold">
              <Lock className="size-5" /> {t("assignment.closed")}
            </div>
          )}
        </Card>
      ) : null}

      {stage.kind === "question" ? (
        <QuestionStage
          key={stage.payload.index}
          payload={stage.payload}
          startedAt={stage.startedAt}
          busy={busy}
          error={error}
          onSubmit={submit}
        />
      ) : null}

      {stage.kind === "result" ? (
        <ResultStage
          result={stage.result}
          total={stage.total}
          onNext={async () => {
            setError(null);
            if (stage.result.finished) {
              setStage({
                kind: "finished",
                score: stage.result.score,
                correctCount: stage.result.correctCount,
                total: stage.total,
              });
            } else {
              try {
                await fetchNext();
              } catch (err) {
                setError(errorMessage(err));
              }
            }
          }}
        />
      ) : null}

      {stage.kind === "finished" ? (
        <Card className="w-full max-w-md text-center">
          <Trophy className="mx-auto size-14 text-sun-500" />
          <h1 className="mt-3 text-3xl font-extrabold">{t("assignment.doneTitle")}</h1>
          <p className="mt-1 text-muted">{t("assignment.doneText", { name: stored.current?.nickname ?? "" })}</p>
          <div className="mt-6 grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-surface-2 p-4">
              <div className="text-3xl font-extrabold">{stage.score}</div>
              <div className="text-sm text-muted">{t("assignment.points")}</div>
            </div>
            <div className="rounded-2xl bg-surface-2 p-4">
              <div className="text-3xl font-extrabold">
                {stage.correctCount}/{stage.total || a.questionCount}
              </div>
              <div className="text-sm text-muted">{t("assignment.correct")}</div>
            </div>
          </div>
          {a.open ? (
            <Button variant="secondary" className="mt-6" onClick={restart}>
              {t("assignment.again")}
            </Button>
          ) : null}
        </Card>
      ) : null}
    </Shell>
  );
}

function Shell({
  children,
  title,
  score,
  streak = 0,
}: {
  children: React.ReactNode;
  title?: string;
  score?: number | null;
  streak?: number;
}) {
  const { t } = useTranslation("game");
  return (
    <GameBackdrop floaters={score === null || score === undefined}>
      <div className="mx-auto flex min-h-dvh max-w-3xl flex-col px-4 py-4">
        <header className="flex items-center gap-3">
          <Link to="/" aria-label="Pinpop">
            <Logo size="sm" />
          </Link>
          {title && score !== null && score !== undefined ? (
            <span className="hidden min-w-0 truncate text-sm font-semibold text-muted sm:inline">{title}</span>
          ) : null}
          <div className="ml-auto flex items-center gap-1">
            {score !== null && score !== undefined ? (
              <span className="mr-2 inline-flex items-center gap-2 rounded-xl whitespace-nowrap border-2 border-ink-900 bg-surface px-3 py-1 font-bold shadow-pop-sm dark:border-ink-600">
                {streak > 1 ? (
                  <span className="inline-flex items-center text-tang-500">
                    <Flame className="size-4" />
                    {streak}
                  </span>
                ) : null}
                {score} {t("play.pointsShort")}
              </span>
            ) : null}
            <LanguageSwitcher />
            <ThemeToggle />
          </div>
        </header>
        <main className="flex flex-1 flex-col items-center justify-center py-6">{children}</main>
      </div>
    </GameBackdrop>
  );
}

function QuestionStage({
  payload,
  startedAt,
  busy,
  error,
  onSubmit,
}: {
  payload: SoloQuestionPayload;
  startedAt: number;
  busy: boolean;
  error: string | null;
  onSubmit: (answer: Answer | null) => void;
}) {
  const { t } = useTranslation("game");
  const q = payload.question;
  const totalMs = q.timeLimit * 1000;
  const [remaining, setRemaining] = useState(() => Math.max(0, totalMs - (Date.now() - startedAt)));
  const submitted = useRef(false);

  useEffect(() => {
    const id = window.setInterval(() => setRemaining(Math.max(0, totalMs - (Date.now() - startedAt))), 100);
    return () => window.clearInterval(id);
  }, [startedAt, totalMs]);

  useEffect(() => {
    if (remaining <= 0 && !submitted.current) {
      submitted.current = true;
      onSubmit(null);
    }
  }, [remaining, onSubmit]);

  return (
    <div className="flex w-full flex-col gap-4">
      <div className="flex items-center justify-between text-sm font-semibold text-muted">
        <span>{t("play.questionOf", { current: payload.index + 1, total: payload.total })}</span>
        <span>{Math.ceil(remaining / 1000)}s</span>
      </div>
      <TimeBar remainingMs={remaining} totalMs={totalMs} />
      <h1 className="text-center text-2xl font-extrabold text-balance sm:text-3xl">{q.text}</h1>
      {q.image ? (
        <img src={q.image} alt="" className="mx-auto max-h-64 rounded-2xl border-2 border-border object-contain" />
      ) : null}
      <div className="min-h-[40dvh]">
        <PlayerAnswer
          question={q}
          showText
          disabled={busy || remaining <= 0}
          onSubmit={(answer) => {
            if (submitted.current) return;
            submitted.current = true;
            onSubmit(answer);
          }}
        />
      </div>
      {error ? <p className="text-center text-sm font-medium text-[#e5383b]">{error}</p> : null}
    </div>
  );
}

function ResultStage({ result, total, onNext }: { result: SoloAnswerResult; total: number; onNext: () => void }) {
  const { t } = useTranslation("game");
  const opinion = result.correct === null;
  const solution: Question | null = result.solution;
  return (
    <div className="flex w-full max-w-md flex-col items-center gap-5 text-center">
      <div
        className={cn(
          "w-full rounded-3xl border-2 border-ink-900 p-8 text-white shadow-pop dark:border-black",
          opinion ? "bg-[#1f9bff]" : result.correct ? "bg-[#12b886]" : "bg-[#ff5a4e]",
        )}
      >
        <div className="text-5xl">{opinion ? "🙌" : result.correct ? "🎉" : "😅"}</div>
        <h2 className="mt-2 text-3xl font-extrabold">
          {opinion
            ? t("play.thanks")
            : result.correct
              ? t("play.correct")
              : result.points > 0
                ? t("play.almost")
                : t("play.wrong")}
        </h2>
        {!opinion ? <p className="mt-1 text-xl font-bold">+{result.points}</p> : null}
        {result.streak > 1 ? (
          <p className="mt-2 inline-flex items-center gap-1 font-semibold">
            <Flame className="size-5" /> {t("play.streak", { count: result.streak })}
          </p>
        ) : null}
      </div>
      {solution && !opinion && !result.correct ? <SolutionSummary solution={solution} className="w-full" /> : null}
      {solution?.explanation ? (
        <p className="rounded-2xl bg-surface-2 p-4 text-left text-sm">{solution.explanation}</p>
      ) : null}
      <Button size="lg" className="w-full" onClick={onNext} autoFocus>
        {result.finished ? t("assignment.seeResults") : t("assignment.next")}
      </Button>
      <p className="text-xs text-muted">{t("assignment.progress", { done: result.correctCount, total })}</p>
    </div>
  );
}
