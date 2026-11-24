import { Check, Flame, Hourglass, PartyPopper, Pause, Trophy, WifiOff, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router";
import { toast } from "sonner";
import { GameBackdrop } from "@/components/game/Backdrop";
import { TimeBar } from "@/components/game/Countdown";
import { burst, celebrate } from "@/components/game/confetti";
import { useCountdown } from "@/components/game/hooks";
import { Leaderboard } from "@/components/game/Leaderboard";
import { PlayerAnswer } from "@/components/game/PlayerAnswer";
import { SolutionSummary } from "@/components/game/Solution";
import { forgetPlayer, loadPlayer, savePlayer } from "@/components/game/session";
import { Button, Spinner } from "@/components/ui";
import { Logo } from "@/components/ui/Logo";
import { useErrorMessage } from "@/hooks/useErrorMessage";
import { emitAck, GameRequestError, getSocket } from "@/lib/socket";
import { sound } from "@/lib/sound";
import { cn } from "@/lib/utils";
import type { Answer, PlayerView } from "@/shared";

type Status = "connecting" | "playing" | "kicked" | "ended" | "error";

export default function Play() {
  const { pin = "" } = useParams();
  const { t } = useTranslation("game");
  const navigate = useNavigate();
  const errorMessage = useErrorMessage();
  const [view, setView] = useState<PlayerView | null>(null);
  const [status, setStatus] = useState<Status>("connecting");
  const [errorText, setErrorText] = useState<string | null>(null);
  const [online, setOnline] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const rejoin = useCallback(async () => {
    const stored = loadPlayer(pin);
    if (!stored) {
      navigate(`/join?pin=${pin}`, { replace: true });
      return;
    }
    try {
      const res = await emitAck<{ playerId: string; playerToken: string }>((ack) =>
        getSocket().emit(
          "player:join",
          { pin, nickname: stored.nickname || "player", avatar: stored.avatar, playerToken: stored.playerToken },
          ack,
        ),
      );
      savePlayer({ ...stored, ...res });
      setStatus("playing");
    } catch (err) {
      const code = err instanceof GameRequestError ? err.code : "";
      if (code === "not_allowed") {
        forgetPlayer(pin);
        setStatus("kicked");
      } else if (code === "game_not_found" || code === "game_started") {
        forgetPlayer(pin);
        setStatus("ended");
      } else if (code !== "timeout") {
        setErrorText(errorMessage(err));
        setStatus("error");
      }
    }
  }, [pin, navigate, errorMessage]);

  useEffect(() => {
    const socket = getSocket();
    const onView = (v: PlayerView) => setView(v);
    const onKicked = () => {
      forgetPlayer(pin);
      setStatus("kicked");
    };
    const onEnded = () => {
      forgetPlayer(pin);
      setStatus((s) => (s === "kicked" ? s : "ended"));
    };
    const onConnect = () => {
      setOnline(true);
      void rejoin();
    };
    const onDisconnect = () => setOnline(false);

    socket.on("player:view", onView);
    socket.on("player:kicked", onKicked);
    socket.on("game:ended", onEnded);
    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    if (socket.connected) void rejoin();
    return () => {
      socket.off("player:view", onView);
      socket.off("player:kicked", onKicked);
      socket.off("game:ended", onEnded);
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
    };
  }, [pin, rejoin]);

  // Sounds and confetti on phase changes.
  const lastPhaseKey = useRef("");
  useEffect(() => {
    if (!view) return;
    const key = `${view.phase}:${view.questionIndex}`;
    if (key === lastPhaseKey.current) return;
    lastPhaseKey.current = key;
    if (view.phase === "reveal" && view.result) {
      if (view.result.correct === true) {
        sound.correct();
        burst();
      } else if (view.result.correct === false) sound.wrong();
      else sound.reveal();
    }
    if (view.phase === "podium" && view.me.rank !== null && view.me.rank <= 3) {
      sound.fanfare();
      celebrate();
    }
  }, [view]);

  const submit = async (answer: Answer) => {
    if (!view || submitting) return;
    setSubmitting(true);
    navigator.vibrate?.(30);
    sound.answer();
    try {
      await emitAck((ack) => getSocket().emit("player:answer", { questionIndex: view.questionIndex, answer }, ack));
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  if (status === "kicked" || status === "ended" || status === "error") {
    return (
      <EndScreen
        emoji={status === "kicked" ? "🚪" : status === "ended" ? "🏁" : "😵"}
        title={
          status === "kicked" ? t("play.kickedTitle") : status === "ended" ? t("play.endedTitle") : t("play.errorTitle")
        }
        text={status === "kicked" ? t("play.kickedText") : status === "ended" ? t("play.endedText") : (errorText ?? "")}
      />
    );
  }

  if (!view) {
    return (
      <GameBackdrop>
        <Spinner className="min-h-dvh" label={t("play.connecting")} />
      </GameBackdrop>
    );
  }

  return (
    <GameBackdrop floaters={view.phase === "lobby"}>
      <div className="mx-auto flex min-h-dvh max-w-2xl flex-col px-4 pt-3 pb-4">
        <TopBar view={view} />
        {!online ? (
          <div
            role="status"
            className="mt-2 flex items-center justify-center gap-2 rounded-2xl bg-ink-900 px-4 py-2 text-sm font-semibold text-white"
          >
            <WifiOff className="size-4" /> {t("play.reconnecting")}
          </div>
        ) : null}
        <main className="relative flex flex-1 flex-col py-4">
          <AnimatePresence mode="wait">
            <motion.div
              key={`${view.phase}-${view.questionIndex}`}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              transition={{ duration: 0.2 }}
              className="flex flex-1 flex-col"
            >
              <PhaseContent view={view} submitting={submitting} onSubmit={submit} />
            </motion.div>
          </AnimatePresence>
          {view.paused ? (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 rounded-3xl bg-bg/90 backdrop-blur-sm">
              <Pause className="size-14 text-pop-500" />
              <p className="font-display text-3xl font-extrabold">{t("play.paused")}</p>
            </div>
          ) : null}
        </main>
      </div>
    </GameBackdrop>
  );
}

function TopBar({ view }: { view: PlayerView }) {
  const { t, i18n } = useTranslation("game");
  return (
    <header className="flex items-center gap-3 rounded-2xl border-2 border-ink-900 bg-surface px-3 py-2 shadow-pop-sm dark:border-ink-600">
      <span className="text-3xl" aria-hidden>
        {view.me.avatar}
      </span>
      <span className="min-w-0 flex-1 truncate font-bold">{view.me.nickname}</span>
      {view.questionIndex >= 0 && view.phase !== "lobby" && view.phase !== "podium" ? (
        <span className="text-sm font-semibold text-muted">
          {t("play.questionOf", { current: view.questionIndex + 1, total: view.totalQuestions })}
        </span>
      ) : null}
      <span className="rounded-xl bg-ink-900 px-3 py-1 font-display font-extrabold text-white tabular-nums dark:bg-white dark:text-ink-900">
        {new Intl.NumberFormat(i18n.language).format(view.me.score)}
      </span>
    </header>
  );
}

function PhaseContent({
  view,
  submitting,
  onSubmit,
}: {
  view: PlayerView;
  submitting: boolean;
  onSubmit: (a: Answer) => void;
}) {
  switch (view.phase) {
    case "lobby":
      return <LobbyWait view={view} />;
    case "intro":
      return <Intro view={view} />;
    case "question":
      return view.answered ? <Waiting /> : <QuestionScreen view={view} submitting={submitting} onSubmit={onSubmit} />;
    case "reveal":
      return <Reveal view={view} />;
    case "leaderboard":
      return <Standings view={view} />;
    case "podium":
      return <Final view={view} />;
  }
}

function LobbyWait({ view }: { view: PlayerView }) {
  const { t } = useTranslation("game");
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 text-center">
      <motion.div
        animate={{ y: [0, -14, 0], rotate: [0, -4, 4, 0] }}
        transition={{ duration: 2.4, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }}
        className="grid size-36 place-items-center rounded-full border-2 border-ink-900 bg-sun-400 text-8xl shadow-pop dark:border-black"
        aria-hidden
      >
        {view.me.avatar}
      </motion.div>
      <div>
        <h1 className="text-4xl font-extrabold">{t("play.youreIn")}</h1>
        <p className="mt-2 text-lg text-muted">{t("play.seeYourName")}</p>
      </div>
      <p className="rounded-full bg-surface-2 px-4 py-1.5 font-semibold">
        {t("play.playersWaiting", { count: view.playerCount })}
      </p>
      <p className="flex items-center gap-2 text-muted">
        <Hourglass className="size-4 animate-spin [animation-duration:3s]" /> {t("play.waitingForHost")}
      </p>
    </div>
  );
}

function Intro({ view }: { view: PlayerView }) {
  const { t } = useTranslation("game");
  const remaining = useCountdown(view.deadline, view.serverNow, view.paused);
  const q = view.question;
  // The component is keyed per question, so this captures the full read time once.
  const [total] = useState(() => (view.deadline ? Math.max(1, view.deadline - view.serverNow) : 1));
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 text-center">
      <span className="rounded-full bg-pop-500 px-4 py-1.5 font-bold text-white">
        {t("play.questionOf", { current: view.questionIndex + 1, total: view.totalQuestions })}
      </span>
      {q && view.showQuestionOnDevices ? (
        <h1 className="text-balance text-3xl font-extrabold sm:text-4xl">{q.text}</h1>
      ) : (
        <h1 className="text-4xl font-extrabold">{t("play.lookAtScreen")}</h1>
      )}
      {q ? <p className="font-semibold text-muted">{t(`common:questionTypes.${q.type}`)}</p> : null}
      <TimeBar remainingMs={remaining} totalMs={total} className="max-w-md" />
      <p className="text-lg font-bold">{t("play.getReady")}</p>
    </div>
  );
}

function QuestionScreen({
  view,
  submitting,
  onSubmit,
}: {
  view: PlayerView;
  submitting: boolean;
  onSubmit: (a: Answer) => void;
}) {
  const q = view.question;
  const remaining = useCountdown(view.deadline, view.serverNow, view.paused);
  if (!q) return null;
  const textInput = q.type === "type" || q.type === "wordcloud" || q.type === "slider" || q.type === "order";
  const showText = view.showQuestionOnDevices || textInput;
  return (
    <div className="flex flex-1 flex-col gap-4">
      <TimeBar remainingMs={remaining} totalMs={q.timeLimit * 1000} />
      {showText ? <h1 className="text-balance text-center text-2xl font-extrabold sm:text-3xl">{q.text}</h1> : null}
      {q.image && view.showQuestionOnDevices ? (
        <img src={q.image} alt="" className="mx-auto max-h-40 rounded-2xl border-2 border-border object-contain" />
      ) : null}
      <PlayerAnswer
        key={q.id}
        question={q}
        showText={view.showQuestionOnDevices}
        disabled={submitting || remaining <= 0}
        onSubmit={onSubmit}
      />
    </div>
  );
}

function Waiting() {
  const { t } = useTranslation("game");
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-5 text-center">
      <motion.div
        initial={{ scale: 0.5 }}
        animate={{ scale: 1 }}
        className="grid size-28 place-items-center rounded-full border-2 border-ink-900 bg-[#1f9bff] text-white shadow-pop dark:border-black"
      >
        <Check className="size-14" strokeWidth={3} />
      </motion.div>
      <h1 className="text-3xl font-extrabold">{t("play.locked")}</h1>
      <p className="text-lg text-muted">{t("play.waitingOthers")}</p>
    </div>
  );
}

function Reveal({ view }: { view: PlayerView }) {
  const { t, i18n } = useTranslation("game");
  const r = view.result;
  if (!r) return <Waiting />;
  const opinion = r.correct === null;
  const answered = view.myAnswer !== null;
  const tone = opinion ? "bg-[#1f9bff]" : r.correct ? "bg-[#12b886]" : "bg-pop-500";
  const title = opinion
    ? answered
      ? t("play.thanks")
      : t("play.noAnswer")
    : r.correct
      ? t("play.correct")
      : answered
        ? r.points > 0
          ? t("play.almost")
          : t("play.wrong")
        : t("play.timeUp");
  const Icon = opinion ? PartyPopper : r.correct ? Check : X;
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-5 text-center">
      <motion.div
        initial={{ scale: 0.4, rotate: -10 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: "spring", stiffness: 260, damping: 14 }}
        className={cn(
          "grid size-32 place-items-center rounded-full border-2 border-ink-900 text-white shadow-pop dark:border-black",
          tone,
        )}
      >
        <Icon className="size-16" strokeWidth={3} />
      </motion.div>
      <h1 className="text-4xl font-extrabold">{title}</h1>
      {!opinion ? (
        <p className="font-display text-3xl font-extrabold text-pop-500 tabular-nums">
          +{new Intl.NumberFormat(i18n.language).format(r.points)}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center justify-center gap-2">
        {r.streak >= 2 ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-tang-500 px-3 py-1 font-bold text-white">
            <Flame className="size-4" /> {t("play.streak", { count: r.streak })}
          </span>
        ) : null}
        <span className="rounded-full bg-surface-2 px-3 py-1 font-semibold">{t("play.rank", { rank: r.rank })}</span>
      </div>
      {view.solution && !opinion && !r.correct ? (
        <SolutionSummary solution={view.solution} className="w-full max-w-md" />
      ) : null}
      {view.solution?.explanation ? (
        <p className="max-w-md rounded-2xl bg-surface-2 p-4 text-left text-sm">💡 {view.solution.explanation}</p>
      ) : null}
    </div>
  );
}

function Standings({ view }: { view: PlayerView }) {
  const { t } = useTranslation("game");
  return (
    <div className="flex flex-1 flex-col items-center gap-5">
      <div className="text-center">
        <p className="font-semibold text-muted">{t("play.yourRank")}</p>
        <p className="font-display text-7xl font-extrabold">#{view.me.rank ?? "–"}</p>
      </div>
      <div className="w-full">
        <Leaderboard entries={view.leaderboard} highlightId={view.me.id} size="md" />
      </div>
    </div>
  );
}

function Final({ view }: { view: PlayerView }) {
  const { t, i18n } = useTranslation("game");
  const navigate = useNavigate();
  const rank = view.me.rank ?? view.playerCount;
  const top = rank <= 3;
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-5 text-center">
      <motion.div
        initial={{ scale: 0.3, rotate: -20 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: "spring", stiffness: 200, damping: 12 }}
        className={cn(
          "grid size-36 place-items-center rounded-full border-2 border-ink-900 shadow-pop dark:border-black",
          top ? "bg-sun-400" : "bg-surface-2",
        )}
      >
        {top ? <Trophy className="size-16 text-ink-900" /> : <span className="text-7xl">{view.me.avatar}</span>}
      </motion.div>
      <h1 className="text-4xl font-extrabold">{top ? t("play.podiumTop", { rank }) : t("play.podiumDone")}</h1>
      <p className="text-xl text-muted">
        {t("play.finalRank", { rank, total: view.playerCount })} ·{" "}
        <span className="font-display font-extrabold text-fg">
          {new Intl.NumberFormat(i18n.language).format(view.me.score)} {t("play.pointsShort")}
        </span>
      </p>
      <div className="w-full max-w-md">
        <Leaderboard entries={view.leaderboard} highlightId={view.me.id} size="md" />
      </div>
      <Button size="lg" variant="secondary" onClick={() => navigate("/join")}>
        {t("play.playAnother")}
      </Button>
    </div>
  );
}

function EndScreen({ emoji, title, text }: { emoji: string; title: string; text: string }) {
  const { t } = useTranslation("game");
  const navigate = useNavigate();
  return (
    <GameBackdrop>
      <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-5 px-6 text-center">
        <Logo size="lg" />
        <span className="text-7xl" aria-hidden>
          {emoji}
        </span>
        <h1 className="text-3xl font-extrabold">{title}</h1>
        <p className="text-lg text-muted">{text}</p>
        <div className="flex gap-3">
          <Button size="lg" onClick={() => navigate("/join")}>
            {t("play.joinAnother")}
          </Button>
          <Button size="lg" variant="secondary" onClick={() => navigate("/")}>
            {t("play.home")}
          </Button>
        </div>
      </div>
    </GameBackdrop>
  );
}
