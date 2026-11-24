import { ArrowLeft, ArrowRight, Shuffle } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useSearchParams } from "react-router";
import { GameBackdrop } from "@/components/game/Backdrop";
import { loadPlayer, savePlayer } from "@/components/game/session";
import { LanguageSwitcher, ThemeToggle } from "@/components/layout/AppShell";
import { Button, Input } from "@/components/ui";
import { Logo } from "@/components/ui/Logo";
import { useErrorMessage } from "@/hooks/useErrorMessage";
import { ApiError, api } from "@/lib/api";
import { emitAck, getSocket } from "@/lib/socket";
import { cn, storage } from "@/lib/utils";
import { AVATARS, PIN_LENGTH } from "@/shared";

const randomAvatar = () => AVATARS[Math.floor(Math.random() * AVATARS.length)] as string;

export default function Join() {
  const { t } = useTranslation("game");
  const errorMessage = useErrorMessage();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const initialPin = (params.get("pin") ?? "").replace(/\D/g, "").slice(0, PIN_LENGTH);

  const [step, setStep] = useState<"pin" | "name">("pin");
  const [pin, setPin] = useState(initialPin);
  const [nickname, setNickname] = useState(() => storage.get("pinpop:nickname") ?? "");
  const [avatar, setAvatar] = useState(() => storage.get("pinpop:avatar") ?? randomAvatar());
  const [randomNames, setRandomNames] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const autoChecked = useRef(false);

  const checkPin = async (value: string) => {
    setError(null);
    setLoading(true);
    try {
      const res = await api.get<{ exists: boolean; acceptingPlayers: boolean; randomNicknames: boolean }>(
        `/api/games/${value}/exists`,
      );
      if (!res.exists) setError(t("common:errors.game_not_found"));
      else if (!res.acceptingPlayers) setError(t("common:errors.game_started"));
      else {
        // Players who were already in this game go straight back to it.
        if (loadPlayer(value)) {
          navigate(`/play/${value}`);
          return;
        }
        setRandomNames(res.randomNicknames);
        setStep("name");
      }
    } catch (err) {
      setError(err instanceof ApiError && err.status === 400 ? t("common:errors.game_not_found") : errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  // Links like /join?pin=123456 skip the PIN step.
  // biome-ignore lint/correctness/useExhaustiveDependencies: run once for the initial PIN
  useEffect(() => {
    if (initialPin.length === PIN_LENGTH && !autoChecked.current) {
      autoChecked.current = true;
      void checkPin(initialPin);
    }
  }, []);

  const join = async () => {
    setError(null);
    setLoading(true);
    try {
      const socket = getSocket();
      const name = randomNames ? "player" : nickname.trim();
      const res = await emitAck<{ playerId: string; playerToken: string }>((ack) =>
        socket.emit("player:join", { pin, nickname: name, avatar }, ack),
      );
      savePlayer({ pin, ...res, nickname: name, avatar });
      if (!randomNames) storage.set("pinpop:nickname", nickname.trim());
      storage.set("pinpop:avatar", avatar);
      navigate(`/play/${pin}`);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <GameBackdrop>
      <div className="mx-auto flex min-h-dvh max-w-xl flex-col px-4 py-4">
        <header className="flex items-center justify-between">
          <Link to="/" aria-label="Pinpop home">
            <Logo />
          </Link>
          <div className="flex items-center gap-1">
            <LanguageSwitcher />
            <ThemeToggle />
          </div>
        </header>

        <main className="flex flex-1 flex-col items-center justify-center py-8">
          {step === "pin" ? (
            <motion.form
              key="pin"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex w-full flex-col items-center gap-6"
              onSubmit={(e) => {
                e.preventDefault();
                if (pin.length === PIN_LENGTH) void checkPin(pin);
              }}
            >
              <div className="text-center">
                <h1 className="text-4xl font-extrabold sm:text-5xl">{t("join.title")}</h1>
                <p className="mt-2 text-lg text-muted">{t("join.subtitle")}</p>
              </div>
              <div className="w-full rounded-3xl border-2 border-ink-900 bg-surface p-5 shadow-pop dark:border-ink-600">
                <label htmlFor="pin" className="sr-only">
                  {t("join.pinLabel")}
                </label>
                <input
                  id="pin"
                  inputMode="numeric"
                  autoComplete="off"
                  autoFocus
                  pattern="[0-9]*"
                  maxLength={PIN_LENGTH}
                  placeholder="000000"
                  value={pin}
                  onChange={(e) => {
                    setError(null);
                    setPin(e.target.value.replace(/\D/g, "").slice(0, PIN_LENGTH));
                  }}
                  aria-invalid={Boolean(error)}
                  aria-describedby={error ? "join-error" : undefined}
                  className="h-20 w-full rounded-2xl border-2 border-border bg-bg text-center font-display text-5xl font-extrabold tracking-[0.3em] tabular-nums placeholder:text-muted/30 focus:border-pop-500 focus:outline-none"
                />
                <Button
                  type="submit"
                  size="xl"
                  className="mt-4 w-full"
                  loading={loading}
                  disabled={pin.length !== PIN_LENGTH}
                >
                  {t("join.enter")} <ArrowRight className="size-6" />
                </Button>
              </div>
            </motion.form>
          ) : (
            <motion.form
              key="name"
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex w-full flex-col items-center gap-6"
              onSubmit={(e) => {
                e.preventDefault();
                if (randomNames || nickname.trim()) void join();
              }}
            >
              <div className="text-center">
                <p className="font-semibold text-muted">
                  {t("join.gamePin")} <span className="font-display font-extrabold text-fg">{pin}</span>
                </p>
                <h1 className="mt-1 text-4xl font-extrabold">
                  {randomNames ? t("join.pickAvatar") : t("join.whoAreYou")}
                </h1>
              </div>

              <div className="w-full rounded-3xl border-2 border-ink-900 bg-surface p-5 shadow-pop dark:border-ink-600">
                <div className="mb-5 flex items-center justify-center gap-3">
                  <motion.span
                    key={avatar}
                    initial={{ scale: 0.5, rotate: -20 }}
                    animate={{ scale: 1, rotate: 0 }}
                    className="grid size-24 place-items-center rounded-full border-2 border-ink-900 bg-sun-400 text-6xl dark:border-ink-600"
                    aria-hidden
                  >
                    {avatar}
                  </motion.span>
                  <Button
                    variant="secondary"
                    size="icon"
                    onClick={() => setAvatar(randomAvatar())}
                    aria-label={t("join.randomAvatar")}
                  >
                    <Shuffle className="size-5" />
                  </Button>
                </div>

                <fieldset className="mb-5">
                  <legend className="sr-only">{t("join.pickAvatar")}</legend>
                  <div className="grid grid-cols-6 gap-1.5 sm:grid-cols-10">
                    {AVATARS.map((a) => (
                      <button
                        key={a}
                        type="button"
                        onClick={() => setAvatar(a)}
                        aria-pressed={a === avatar}
                        aria-label={a}
                        className={cn(
                          "grid aspect-square place-items-center rounded-xl text-2xl transition-transform hover:scale-110",
                          a === avatar ? "bg-pop-100 ring-2 ring-pop-500 dark:bg-pop-900/40" : "hover:bg-surface-2",
                        )}
                      >
                        {a}
                      </button>
                    ))}
                  </div>
                </fieldset>

                {randomNames ? (
                  <p className="mb-4 rounded-2xl bg-surface-2 p-3 text-center text-sm text-muted">
                    {t("join.randomNamesHint")}
                  </p>
                ) : (
                  <>
                    <label htmlFor="nickname" className="mb-1.5 block text-sm font-semibold">
                      {t("join.nickname")}
                    </label>
                    <Input
                      id="nickname"
                      autoFocus
                      maxLength={20}
                      autoComplete="nickname"
                      value={nickname}
                      onChange={(e) => {
                        setError(null);
                        setNickname(e.target.value);
                      }}
                      placeholder={t("join.nicknamePlaceholder")}
                      aria-invalid={Boolean(error)}
                      aria-describedby={error ? "join-error" : undefined}
                      className="h-14 text-center text-xl font-bold"
                    />
                  </>
                )}
                <Button
                  type="submit"
                  size="xl"
                  className="mt-4 w-full"
                  loading={loading}
                  disabled={!randomNames && !nickname.trim()}
                >
                  {t("join.letsGo")} 🚀
                </Button>
              </div>
              <button
                type="button"
                onClick={() => {
                  setStep("pin");
                  setError(null);
                }}
                className="inline-flex items-center gap-1 text-sm font-semibold text-muted hover:text-fg"
              >
                <ArrowLeft className="size-4" /> {t("join.otherPin")}
              </button>
            </motion.form>
          )}

          {error ? (
            <motion.p
              id="join-error"
              role="alert"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="mt-6 rounded-2xl border-2 border-ink-900 bg-pop-500 px-5 py-3 text-center font-bold text-white shadow-pop-sm dark:border-black"
            >
              {error}
            </motion.p>
          ) : null}
        </main>

        <footer className="pb-2 text-center text-sm text-muted">
          {t("join.hostCta")}{" "}
          <Link to="/register" className="font-semibold text-pop-500 hover:underline">
            {t("join.hostLink")}
          </Link>
        </footer>
      </div>
    </GameBackdrop>
  );
}
