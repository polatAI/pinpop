import {
  ArrowRight,
  BarChart3,
  Expand,
  LayoutGrid,
  Lock,
  LockOpen,
  LogOut,
  Pause,
  Play as PlayIcon,
  Shrink,
  SkipForward,
  Users,
  Volume2,
  VolumeX,
  WifiOff,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { QRCodeSVG } from "qrcode.react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router";
import { toast } from "sonner";
import { AnswerTile } from "@/components/game/AnswerTile";
import { answerStyle, FALSE_STYLE, TRUE_STYLE } from "@/components/game/answerStyles";
import { GameBackdrop } from "@/components/game/Backdrop";
import { CountdownRing, TimeBar } from "@/components/game/Countdown";
import { celebrate } from "@/components/game/confetti";
import { useCountdown, useLastSecondsTick } from "@/components/game/hooks";
import { Leaderboard } from "@/components/game/Leaderboard";
import { Podium } from "@/components/game/Podium";
import { RevealStats } from "@/components/game/RevealStats";
import { hostKey } from "@/components/game/session";
import { ThemeToggle } from "@/components/layout/AppShell";
import { Button, Dialog, Spinner } from "@/components/ui";
import { Logo } from "@/components/ui/Logo";
import { useErrorMessage } from "@/hooks/useErrorMessage";
import { emitAck, GameRequestError, getSocket } from "@/lib/socket";
import { sound } from "@/lib/sound";
import { cn, storage } from "@/lib/utils";
import { formatPin, type HostView } from "@/shared";

type Status = "connecting" | "ready" | "missing" | "ended";

function readToken(pin: string): string | null {
  const fromHash = window.location.hash.replace(/^#/, "");
  if (fromHash) {
    storage.set(hostKey(pin), fromHash);
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
    return fromHash;
  }
  return storage.get(hostKey(pin));
}

export default function Host() {
  const { pin = "" } = useParams();
  const { t } = useTranslation("game");
  const navigate = useNavigate();
  const errorMessage = useErrorMessage();
  const [token] = useState(() => readToken(pin));
  const [view, setView] = useState<HostView | null>(null);
  const [status, setStatus] = useState<Status>(token ? "connecting" : "missing");
  const [online, setOnline] = useState(true);
  const [muted, setMuted] = useState(sound.isMuted());
  const [fullscreen, setFullscreen] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [kickTarget, setKickTarget] = useState<{ id: string; nickname: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const attach = useCallback(async () => {
    if (!token) return;
    try {
      await emitAck((ack) => getSocket().emit("host:attach", { pin, hostToken: token }, ack));
      setStatus("ready");
    } catch (err) {
      if (err instanceof GameRequestError && (err.code === "game_not_found" || err.code === "not_allowed")) {
        storage.remove(hostKey(pin));
        setStatus("missing");
      }
    }
  }, [pin, token]);

  useEffect(() => {
    if (!token) return;
    const socket = getSocket();
    const onView = (v: HostView) => setView(v);
    const onEnded = () => {
      storage.remove(hostKey(pin));
      sound.stopLobby();
      setStatus("ended");
    };
    const onConnect = () => {
      setOnline(true);
      void attach();
    };
    const onDisconnect = () => setOnline(false);
    socket.on("host:view", onView);
    socket.on("game:ended", onEnded);
    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    if (socket.connected) void attach();
    return () => {
      socket.off("host:view", onView);
      socket.off("game:ended", onEnded);
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
    };
  }, [pin, token, attach]);

  // Stop the music when leaving the page.
  useEffect(() => () => sound.stopLobby(), []);

  // Lobby music needs a user gesture before browsers allow audio.
  const phase = view?.phase;
  useEffect(() => {
    if (phase !== "lobby" || muted) {
      sound.stopLobby();
      return;
    }
    const start = () => sound.startLobby();
    window.addEventListener("pointerdown", start, { once: true });
    window.addEventListener("keydown", start, { once: true });
    return () => {
      window.removeEventListener("pointerdown", start);
      window.removeEventListener("keydown", start);
    };
  }, [phase, muted]);

  // Phase sounds and effects.
  const lastKey = useRef("");
  useEffect(() => {
    if (!view) return;
    const key = `${view.phase}:${view.questionIndex}`;
    if (key === lastKey.current) return;
    const first = lastKey.current === "";
    lastKey.current = key;
    if (first) return;
    if (view.phase === "intro") sound.start();
    if (view.phase === "reveal") sound.reveal();
    if (view.phase === "podium") {
      sound.fanfare();
      celebrate(5000);
    }
  }, [view]);

  // A pop for every player who joins the lobby.
  const playerCount = view?.players.length ?? 0;
  const prevCount = useRef(playerCount);
  useEffect(() => {
    if (phase === "lobby" && playerCount > prevCount.current) sound.join();
    prevCount.current = playerCount;
  }, [playerCount, phase]);

  useEffect(() => {
    const onChange = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const run = useCallback(
    async (fn: (ack: (r: never) => void) => void) => {
      setBusy(true);
      try {
        await emitAck(fn as never);
      } catch (err) {
        toast.error(errorMessage(err));
      } finally {
        setBusy(false);
      }
    },
    [errorMessage],
  );

  const next = useCallback(() => {
    if (!view || view.phase === "podium") return;
    if (view.phase === "lobby" && view.players.length === 0) return;
    void run((ack) => getSocket().emit(view.phase === "lobby" ? "host:start" : "host:next", ack as never));
  }, [view, run]);

  // Space / Enter / → advance the game.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (confirmEnd || kickTarget) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT"))
        return;
      if (target?.tagName === "BUTTON" && (e.key === " " || e.key === "Enter")) return;
      if (e.key === " " || e.key === "Enter" || e.key === "ArrowRight") {
        e.preventDefault();
        next();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, confirmEnd, kickTarget]);

  const endGame = async (to = "/dashboard") => {
    setConfirmEnd(false);
    try {
      await emitAck((ack) => getSocket().emit("host:end", ack));
    } catch {
      /* the game may already be gone */
    }
    storage.remove(hostKey(pin));
    sound.stopLobby();
    navigate(to);
  };

  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen?.().catch(() => {});
  };

  const toggleMute = () => {
    sound.setMuted(!muted);
    setMuted(!muted);
  };

  if (status === "missing" || status === "ended") {
    return (
      <GameBackdrop>
        <div className="mx-auto flex min-h-dvh max-w-lg flex-col items-center justify-center gap-5 px-6 text-center">
          <Logo size="lg" />
          <span className="text-7xl" aria-hidden>
            {status === "ended" ? "🏁" : "🔍"}
          </span>
          <h1 className="text-3xl font-extrabold">
            {status === "ended" ? t("host.endedTitle") : t("host.missingTitle")}
          </h1>
          <p className="text-lg text-muted">{status === "ended" ? t("host.endedText") : t("host.missingText")}</p>
          <div className="flex flex-wrap justify-center gap-3">
            <Button size="lg" onClick={() => navigate("/dashboard")}>
              <LayoutGrid className="size-5" /> {t("host.toDashboard")}
            </Button>
            {status === "ended" ? (
              <Button size="lg" variant="secondary" onClick={() => navigate("/reports")}>
                <BarChart3 className="size-5" /> {t("host.viewReports")}
              </Button>
            ) : null}
          </div>
        </div>
      </GameBackdrop>
    );
  }

  if (!view) {
    return (
      <GameBackdrop>
        <Spinner className="min-h-dvh" label={t("host.connecting")} />
      </GameBackdrop>
    );
  }

  const isLast = view.questionIndex >= view.totalQuestions - 1;
  const nextLabel = {
    lobby: t("host.start"),
    intro: t("host.showAnswers"),
    question: t("host.skip"),
    reveal: isLast ? t("host.finalResults") : t("host.leaderboard"),
    leaderboard: t("host.nextQuestion"),
    podium: "",
  }[view.phase];

  return (
    <GameBackdrop floaters={view.phase === "lobby"}>
      <div className="flex min-h-dvh flex-col">
        {/* Top bar */}
        <header className="flex flex-wrap items-center gap-3 px-4 py-3 lg:px-8">
          <Logo size="sm" />
          <span className="hidden max-w-[30vw] truncate font-semibold text-muted md:inline">{view.quizTitle}</span>
          <div className="ml-auto flex items-center gap-1.5">
            {view.phase !== "lobby" ? (
              <span className="rounded-xl bg-surface px-3 py-1.5 font-display font-bold shadow-sm">
                PIN {formatPin(view.pin)}
              </span>
            ) : null}
            {view.phase !== "lobby" && view.phase !== "podium" ? (
              <span className="rounded-xl bg-surface px-3 py-1.5 font-semibold shadow-sm">
                {t("host.questionOf", { current: view.questionIndex + 1, total: view.totalQuestions })}
              </span>
            ) : null}
            <span className="inline-flex items-center gap-1.5 rounded-xl bg-surface px-3 py-1.5 font-semibold shadow-sm">
              <Users className="size-4" /> {view.players.length}
            </span>
            {view.phase === "question" || view.phase === "intro" ? (
              <IconButton
                label={view.paused ? t("host.resume") : t("host.pause")}
                onClick={() => run((ack) => getSocket().emit("host:pause", !view.paused, ack as never))}
              >
                {view.paused ? <PlayIcon className="size-5" /> : <Pause className="size-5" />}
              </IconButton>
            ) : null}
            <IconButton label={muted ? t("host.unmute") : t("host.mute")} onClick={toggleMute}>
              {muted ? <VolumeX className="size-5" /> : <Volume2 className="size-5" />}
            </IconButton>
            <IconButton label={fullscreen ? t("host.exitFullscreen") : t("host.fullscreen")} onClick={toggleFullscreen}>
              {fullscreen ? <Shrink className="size-5" /> : <Expand className="size-5" />}
            </IconButton>
            <ThemeToggle className="bg-surface shadow-sm" />
            <IconButton label={t("host.end")} onClick={() => setConfirmEnd(true)}>
              <LogOut className="size-5" />
            </IconButton>
          </div>
        </header>

        {!online ? (
          <div
            role="status"
            className="mx-auto flex items-center gap-2 rounded-2xl bg-ink-900 px-4 py-2 text-sm font-semibold text-white"
          >
            <WifiOff className="size-4" /> {t("host.reconnecting")}
          </div>
        ) : null}

        <main className="relative flex flex-1 flex-col px-4 pb-4 lg:px-8">
          <AnimatePresence mode="wait">
            <motion.div
              key={`${view.phase}-${view.questionIndex}`}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.25 }}
              className="flex flex-1 flex-col"
            >
              {view.phase === "lobby" ? (
                <Lobby
                  view={view}
                  busy={busy}
                  onStart={next}
                  onLock={(locked) => run((ack) => getSocket().emit("host:lock", locked, ack as never))}
                  onKick={(p) => setKickTarget(p)}
                />
              ) : null}
              {view.phase === "intro" ? <IntroScreen view={view} /> : null}
              {view.phase === "question" ? <QuestionScreen view={view} /> : null}
              {view.phase === "reveal" ? <RevealScreen view={view} /> : null}
              {view.phase === "leaderboard" ? <LeaderboardScreen view={view} /> : null}
              {view.phase === "podium" ? (
                <PodiumScreen
                  view={view}
                  onReports={() => endGame("/reports")}
                  onExit={() => endGame("/dashboard")}
                  onDashboard={() => endGame("/dashboard")}
                />
              ) : null}
            </motion.div>
          </AnimatePresence>

          {view.paused ? (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-bg/85 backdrop-blur-sm">
              <Pause className="size-20 text-pop-500" />
              <p className="font-display text-5xl font-extrabold">{t("host.paused")}</p>
              <Button size="lg" onClick={() => run((ack) => getSocket().emit("host:pause", false, ack as never))}>
                <PlayIcon className="size-5" /> {t("host.resume")}
              </Button>
            </div>
          ) : null}
        </main>

        {view.phase !== "lobby" && view.phase !== "podium" ? (
          <footer className="flex items-center justify-end gap-3 px-4 pb-4 lg:px-8">
            <span className="mr-auto hidden text-sm text-muted md:inline">{t("host.keyboardHint")}</span>
            <Button
              size="lg"
              variant={view.phase === "question" ? "secondary" : "primary"}
              onClick={next}
              disabled={busy}
            >
              {view.phase === "question" ? <SkipForward className="size-5" /> : null}
              {nextLabel}
              {view.phase !== "question" ? <ArrowRight className="size-5" /> : null}
            </Button>
          </footer>
        ) : null}
      </div>

      <Dialog
        open={confirmEnd}
        onClose={() => setConfirmEnd(false)}
        title={t("host.endTitle")}
        description={t("host.endText")}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmEnd(false)}>
              {t("common:actions.cancel")}
            </Button>
            <Button variant="danger" onClick={() => endGame()}>
              {t("host.end")}
            </Button>
          </>
        }
      />
      <Dialog
        open={kickTarget !== null}
        onClose={() => setKickTarget(null)}
        title={t("host.kickTitle", { name: kickTarget?.nickname ?? "" })}
        description={t("host.kickText")}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setKickTarget(null)}>
              {t("common:actions.cancel")}
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                const id = kickTarget?.id;
                setKickTarget(null);
                if (id) void run((ack) => getSocket().emit("host:kick", id, ack as never));
              }}
            >
              {t("host.kick")}
            </Button>
          </>
        }
      />
    </GameBackdrop>
  );
}

function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="rounded-xl bg-surface p-2 text-muted shadow-sm hover:text-fg"
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------- lobby

function Lobby({
  view,
  busy,
  onStart,
  onLock,
  onKick,
}: {
  view: HostView;
  busy: boolean;
  onStart: () => void;
  onLock: (locked: boolean) => void;
  onKick: (p: { id: string; nickname: string }) => void;
}) {
  const { t } = useTranslation("game");
  const joinHost = `${window.location.host}/join`;
  const joinUrl = `${window.location.origin}/join?pin=${view.pin}`;
  return (
    <div className="grid flex-1 gap-6 lg:grid-cols-[minmax(0,26rem)_1fr] lg:gap-10">
      <section className="flex flex-col items-center gap-5 rounded-3xl border-2 border-ink-900 bg-surface p-6 text-center shadow-pop dark:border-ink-600">
        <p className="text-lg font-semibold text-muted">
          {t("host.joinAt")} <span className="font-bold break-all text-fg">{joinHost}</span>
        </p>
        <div>
          <p className="text-sm font-bold tracking-widest text-muted uppercase">{t("host.gamePin")}</p>
          <p className="font-display text-6xl leading-none font-extrabold tracking-wide whitespace-nowrap tabular-nums xl:text-7xl">
            {formatPin(view.pin)}
          </p>
        </div>
        <div className="rounded-2xl border-2 border-border bg-white p-3">
          <QRCodeSVG value={joinUrl} size={180} level="M" marginSize={0} title={t("host.qrLabel")} />
        </div>
        <p className="text-sm text-muted">{t("host.scanToJoin")}</p>
        <div className="mt-auto flex w-full flex-col gap-3">
          <Button size="xl" onClick={onStart} disabled={view.players.length === 0 || busy} loading={busy}>
            <PlayIcon className="size-6" /> {t("host.start")}
          </Button>
          <Button variant="secondary" onClick={() => onLock(!view.locked)}>
            {view.locked ? <Lock className="size-4" /> : <LockOpen className="size-4" />}
            {view.locked ? t("host.unlock") : t("host.lock")}
          </Button>
        </div>
      </section>

      <section className="flex min-h-80 flex-col">
        <div className="mb-4 flex items-baseline justify-between gap-3">
          <h1 className="truncate text-3xl font-extrabold lg:text-4xl">{view.quizTitle}</h1>
          <span className="shrink-0 rounded-full bg-pop-500 px-4 py-1.5 font-display text-xl font-extrabold text-white">
            {t("common:players", { count: view.players.length })}
          </span>
        </div>
        {view.locked ? (
          <p className="mb-3 inline-flex items-center gap-2 self-start rounded-xl bg-ink-900 px-3 py-1.5 text-sm font-semibold text-white">
            <Lock className="size-4" /> {t("host.lockedHint")}
          </p>
        ) : null}
        {view.players.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-3xl border-2 border-dashed border-border p-10 text-center">
            <motion.span
              className="text-6xl"
              animate={{ rotate: [0, -10, 10, 0] }}
              transition={{ repeat: Number.POSITIVE_INFINITY, duration: 2 }}
              aria-hidden
            >
              👀
            </motion.span>
            <p className="text-2xl font-bold">{t("host.waitingPlayers")}</p>
            <p className="text-muted">{t("host.kickHint")}</p>
          </div>
        ) : (
          <>
            <ul className="flex flex-wrap content-start gap-3" aria-live="polite">
              <AnimatePresence>
                {view.players.map((p) => (
                  <motion.li
                    key={p.id}
                    layout
                    initial={{ opacity: 0, scale: 0.4 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.4 }}
                    transition={{ type: "spring", stiffness: 400, damping: 20 }}
                  >
                    <button
                      type="button"
                      onClick={() => onKick({ id: p.id, nickname: p.nickname })}
                      title={t("host.kickTitle", { name: p.nickname })}
                      className={cn(
                        "group inline-flex items-center gap-2 rounded-full border-2 border-ink-900 bg-surface py-1.5 pr-4 pl-1.5 text-lg font-bold shadow-pop-sm transition-transform hover:-rotate-2 hover:bg-pop-50 dark:border-ink-600 dark:hover:bg-pop-900/30",
                        !p.connected && "opacity-50",
                      )}
                    >
                      <span className="grid size-9 place-items-center rounded-full bg-surface-2 text-2xl" aria-hidden>
                        {p.avatar}
                      </span>
                      <span className="group-hover:line-through">{p.nickname}</span>
                    </button>
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
            <p className="mt-4 text-sm text-muted">{t("host.kickHint")}</p>
          </>
        )}
      </section>
    </div>
  );
}

// ---------------------------------------------------------------- question phases

function QuestionHeading({ view, size = "lg" }: { view: HostView; size?: "lg" | "md" }) {
  if (!view.question) return null;
  return (
    <h1
      className={cn(
        "mx-auto max-w-6xl text-balance rounded-3xl border-2 border-ink-900 bg-surface px-6 py-5 text-center font-extrabold shadow-pop dark:border-ink-600",
        size === "lg" ? "text-3xl lg:text-5xl" : "text-2xl lg:text-3xl",
      )}
    >
      {view.question.text}
    </h1>
  );
}

function IntroScreen({ view }: { view: HostView }) {
  const { t } = useTranslation("game");
  const remaining = useCountdown(view.deadline, view.serverNow, view.paused);
  const [total] = useState(() => (view.deadline ? Math.max(1, view.deadline - view.serverNow) : 1));
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-8">
      <motion.span
        initial={{ scale: 0.5 }}
        animate={{ scale: 1 }}
        className="rounded-full bg-pop-500 px-6 py-2 font-display text-2xl font-extrabold text-white"
      >
        {t("host.questionOf", { current: view.questionIndex + 1, total: view.totalQuestions })}
      </motion.span>
      <QuestionHeading view={view} />
      {view.question ? (
        <p className="text-xl font-semibold text-muted">{t(`common:questionTypes.${view.question.type}`)}</p>
      ) : null}
      <TimeBar remainingMs={remaining} totalMs={total} className="max-w-2xl" />
    </div>
  );
}

function QuestionScreen({ view }: { view: HostView }) {
  const { t } = useTranslation("game");
  const q = view.question;
  const remaining = useCountdown(view.deadline, view.serverNow, view.paused);
  useLastSecondsTick(remaining, !view.paused, sound.tick);
  if (!q) return null;
  return (
    <div className="flex flex-1 flex-col gap-5">
      <QuestionHeading view={view} />
      <div className="flex flex-1 items-center justify-between gap-6">
        <CountdownRing remainingMs={remaining} totalMs={q.timeLimit * 1000} size={120} />
        <div className="flex min-h-0 flex-1 justify-center">
          {q.image ? (
            <img src={q.image} alt="" className="max-h-[32vh] rounded-3xl border-2 border-border object-contain" />
          ) : (
            <HintCard type={q.type} />
          )}
        </div>
        <div className="grid size-[120px] shrink-0 place-items-center rounded-full border-2 border-ink-900 bg-surface text-center shadow-pop dark:border-ink-600">
          <div>
            <div className="font-display text-4xl font-extrabold tabular-nums">{view.answeredCount}</div>
            <div className="text-xs font-bold text-muted uppercase">{t("host.answers")}</div>
          </div>
        </div>
      </div>
      <AnswerDisplay view={view} />
    </div>
  );
}

function HintCard({ type }: { type: string }) {
  const { t } = useTranslation("game");
  const emoji: Record<string, string> = {
    quiz: "🤔",
    multi: "☑️",
    truefalse: "⚖️",
    type: "⌨️",
    slider: "🎚️",
    order: "🔢",
    poll: "🗳️",
    wordcloud: "☁️",
  };
  return (
    <div className="flex flex-col items-center gap-2 text-center">
      <span className="animate-float text-7xl" aria-hidden>
        {emoji[type] ?? "🤔"}
      </span>
      <p className="text-xl font-semibold text-muted">{t(`host.hint.${type}`)}</p>
    </div>
  );
}

function AnswerDisplay({ view }: { view: HostView }) {
  const { t } = useTranslation("common");
  const q = view.question;
  if (!q) return null;
  if (q.type === "quiz" || q.type === "multi" || q.type === "poll") {
    return (
      <div
        className={cn(
          "grid gap-4",
          q.choices.length <= 2 ? "grid-cols-2" : q.choices.length <= 4 ? "grid-cols-2" : "grid-cols-3",
        )}
      >
        {q.choices.map((c, i) => (
          <AnswerTile key={c.id} style={answerStyle(i)} label={c.text} size="xl" tabIndex={-1} />
        ))}
      </div>
    );
  }
  if (q.type === "truefalse") {
    return (
      <div className="grid grid-cols-2 gap-4">
        <AnswerTile style={TRUE_STYLE} label={t("true")} size="xl" tabIndex={-1} />
        <AnswerTile style={FALSE_STYLE} label={t("false")} size="xl" tabIndex={-1} />
      </div>
    );
  }
  return null;
}

function RevealScreen({ view }: { view: HostView }) {
  return (
    <div className="flex flex-1 flex-col gap-5">
      <QuestionHeading view={view} size="md" />
      {view.solution && view.stats ? (
        <RevealStats solution={view.solution} stats={view.stats} playerCount={view.players.length} />
      ) : null}
      {view.solution?.explanation ? (
        <p className="mx-auto max-w-4xl rounded-2xl bg-surface px-5 py-3 text-center text-lg shadow-sm">
          💡 {view.solution.explanation}
        </p>
      ) : null}
    </div>
  );
}

function LeaderboardScreen({ view }: { view: HostView }) {
  const { t } = useTranslation("game");
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6">
      <h1 className="text-center text-4xl font-extrabold lg:text-5xl">{t("host.scoreboard")}</h1>
      <Leaderboard entries={view.leaderboard} />
    </div>
  );
}

function PodiumScreen({
  view,
  onReports,
  onExit,
  onDashboard,
}: {
  view: HostView;
  onReports: () => void;
  onExit: () => void;
  onDashboard: () => void;
}) {
  const { t } = useTranslation("game");
  const rest = view.leaderboard.filter((e) => e.rank > 3);
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col items-center gap-8">
      <motion.h1
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="text-center text-5xl font-extrabold lg:text-6xl"
      >
        {t("host.champions")} 🏆
      </motion.h1>
      <Podium entries={view.leaderboard} />
      {rest.length > 0 ? (
        <div className="w-full max-w-3xl">
          <Leaderboard entries={rest} size="md" />
        </div>
      ) : null}
      <div className="flex flex-wrap justify-center gap-3">
        <Button size="lg" onClick={onReports}>
          <BarChart3 className="size-5" /> {t("host.viewReport")}
        </Button>
        <Button size="lg" variant="sun" onClick={onDashboard}>
          <PlayIcon className="size-5" /> {t("host.playAgain")}
        </Button>
        <Button size="lg" variant="secondary" onClick={onExit}>
          <LogOut className="size-5" /> {t("host.exit")}
        </Button>
      </div>
    </div>
  );
}
