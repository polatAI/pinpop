import {
  ArrowRight,
  BarChart3,
  Bot,
  ClipboardList,
  Languages,
  Lock,
  Moon,
  Plug,
  Server,
  Shapes,
  Sparkles,
  Users,
} from "lucide-react";
import { motion } from "motion/react";
import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { ANSWER_STYLES } from "@/components/game/answerStyles";
import { GITHUB_URL } from "@/components/layout/AppShell";
import { CopyBox, PageContainer } from "@/components/pages/common";
import { Button } from "@/components/ui";
import { GithubIcon } from "@/components/ui/GithubIcon";
import { useAiAvailable, useAuth, useInstance } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

function PinBox({ large }: { large?: boolean }) {
  const { t } = useTranslation("pages");
  const navigate = useNavigate();
  const [pin, setPin] = useState("");
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (pin.length === 6) navigate(`/join?pin=${pin}`);
  };
  return (
    <form
      onSubmit={submit}
      className={cn(
        "flex w-full max-w-md items-center gap-2 rounded-3xl border-2 border-ink-900 bg-surface p-2 shadow-pop dark:border-ink-600",
        large && "max-w-lg",
      )}
    >
      <label htmlFor="landing-pin" className="sr-only">
        {t("landing.pinLabel")}
      </label>
      <input
        id="landing-pin"
        inputMode="numeric"
        autoComplete="off"
        maxLength={7}
        placeholder={t("landing.pinPlaceholder")}
        value={pin.length > 3 ? `${pin.slice(0, 3)} ${pin.slice(3)}` : pin}
        onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
        className="h-14 min-w-0 flex-1 bg-transparent px-4 text-center font-display text-2xl font-bold tracking-[0.2em] placeholder:tracking-normal placeholder:text-muted/60 focus:outline-none"
      />
      <Button type="submit" size="lg" disabled={pin.length !== 6} className="h-14">
        {t("landing.joinButton")}
      </Button>
    </form>
  );
}

function FloatingTiles() {
  const positions = [
    "top-6 left-[6%] rotate-[-12deg]",
    "top-24 right-[8%] rotate-[10deg]",
    "bottom-24 left-[10%] rotate-[8deg]",
    "bottom-8 right-[14%] rotate-[-8deg]",
    "top-1/2 left-[2%] rotate-[14deg] hidden lg:grid",
    "top-10 right-[30%] rotate-[-6deg] hidden lg:grid",
  ];
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {ANSWER_STYLES.map((s, i) => (
        <div
          key={s.letter}
          className={cn(
            "absolute grid size-14 place-items-center rounded-2xl border-2 border-ink-900 text-white shadow-pop sm:size-20",
            s.bg,
            positions[i],
          )}
          style={{ animation: `float ${5 + i}s ease-in-out ${i * 0.4}s infinite` }}
        >
          <s.Icon className="size-7 sm:size-9" />
        </div>
      ))}
    </div>
  );
}

export default function Landing() {
  const { t } = useTranslation("pages");
  const { user } = useAuth();
  const { data: instance } = useInstance();
  const navigate = useNavigate();
  const instanceName = instance?.name ?? "Pinpop";
  // Instances with AI switched off advertise homework mode instead of the AI writer.
  const aiAvailable = useAiAvailable();
  const noAi = instance !== undefined && !aiAvailable;

  const features = [
    { icon: Shapes, key: "types", tone: "bg-ans-a" },
    noAi ? { icon: ClipboardList, key: "homework", tone: "bg-ans-e" } : { icon: Sparkles, key: "ai", tone: "bg-ans-e" },
    { icon: Plug, key: "mcp", tone: "bg-ans-b" },
    { icon: Server, key: "selfhost", tone: "bg-ans-d" },
    { icon: Users, key: "realtime", tone: "bg-ans-c" },
    { icon: BarChart3, key: "reports", tone: "bg-ans-f" },
    { icon: GithubIcon, key: "opensource", tone: "bg-ink-900" },
    { icon: Lock, key: "privacy", tone: "bg-ans-b" },
    { icon: Languages, key: "i18n", tone: "bg-ans-d" },
    { icon: Moon, key: "dark", tone: "bg-ans-e" },
  ] as const;

  const steps = ["create", "host", "play"] as const;

  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden border-b-2 border-border">
        <div className="absolute inset-0 text-pop-500/10 bg-dots" aria-hidden />
        <FloatingTiles />
        <div className="relative mx-auto flex max-w-4xl flex-col items-center px-4 pt-20 pb-24 text-center sm:px-6 sm:pt-28 sm:pb-32">
          <motion.span
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 inline-flex items-center gap-2 rounded-full border-2 border-ink-900 bg-sun-400 px-4 py-1.5 text-sm font-bold text-ink-900 dark:border-black"
          >
            {noAi ? <Users className="size-4" /> : <Bot className="size-4" />}{" "}
            {t(noAi ? "landing.badgeNoAi" : "landing.badge")}
          </motion.span>
          <motion.h1
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="text-5xl leading-[1.02] font-extrabold text-balance sm:text-7xl"
          >
            {t("landing.titleA")} <span className="text-pop-500">{t("landing.titleB")}</span>
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="mt-6 max-w-2xl text-lg text-muted text-balance sm:text-xl"
          >
            {t(noAi ? "landing.subtitleNoAi" : "landing.subtitle", { name: instanceName })}
          </motion.p>
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="mt-10 flex w-full flex-col items-center gap-4"
          >
            <PinBox large />
            <div className="flex flex-wrap items-center justify-center gap-3">
              <Button variant="dark" size="lg" onClick={() => navigate(user ? "/dashboard" : "/register")}>
                {t("landing.createCta")} <ArrowRight className="size-4" />
              </Button>
              <a href={GITHUB_URL} target="_blank" rel="noreferrer">
                <Button variant="secondary" size="lg">
                  <GithubIcon className="size-5" /> {t("landing.githubCta")}
                </Button>
              </a>
            </div>
          </motion.div>
        </div>
      </section>

      {/* How it works */}
      <PageContainer className="py-20">
        <h2 className="text-center text-4xl font-extrabold">{t("landing.howTitle")}</h2>
        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {steps.map((step, i) => {
            const s = ANSWER_STYLES[i];
            return (
              <div
                key={step}
                className="relative rounded-3xl border-2 border-ink-900 bg-surface p-6 shadow-pop dark:border-ink-600"
              >
                <div
                  className={cn(
                    "mb-4 grid size-12 place-items-center rounded-2xl font-display text-2xl font-extrabold text-white",
                    s?.bg,
                  )}
                >
                  {i + 1}
                </div>
                <h3 className="text-xl font-bold">{t(`landing.steps.${step}.title`)}</h3>
                <p className="mt-2 text-muted">
                  {t(noAi && step === "create" ? "landing.steps.create.textNoAi" : `landing.steps.${step}.text`)}
                </p>
              </div>
            );
          })}
        </div>
      </PageContainer>

      {/* Features */}
      <section className="border-y-2 border-border bg-surface-2/50">
        <PageContainer className="py-20">
          <h2 className="text-center text-4xl font-extrabold">{t("landing.featuresTitle")}</h2>
          <p className="mx-auto mt-3 max-w-2xl text-center text-muted">{t("landing.featuresSubtitle")}</p>
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {features.map(({ icon: Icon, key, tone }) => (
              <div key={key} className="rounded-3xl border-2 border-border bg-surface p-5">
                <div
                  className={cn(
                    "mb-4 grid size-11 place-items-center rounded-2xl text-white",
                    tone,
                    tone === "bg-ink-900" && "dark:bg-white dark:text-ink-900",
                  )}
                >
                  <Icon className="size-5" />
                </div>
                <h3 className="font-bold">{t(`landing.features.${key}.title`)}</h3>
                <p className="mt-1 text-sm text-muted">{t(`landing.features.${key}.text`)}</p>
              </div>
            ))}
          </div>
        </PageContainer>
      </section>

      {/* Self host */}
      <PageContainer className="py-20">
        <div className="grid items-center gap-10 lg:grid-cols-2">
          <div>
            <h2 className="text-4xl font-extrabold">{t("landing.selfHostTitle")}</h2>
            <p className="mt-4 text-lg text-muted">{t("landing.selfHostText")}</p>
            <ul className="mt-6 space-y-2 font-medium">
              {(["one", "two", "three"] as const).map((k) => (
                <li key={k} className="flex items-start gap-2">
                  <span className="mt-1 size-2.5 shrink-0 rounded-full bg-pop-500" />
                  {t(`landing.selfHostPoints.${k}`)}
                </li>
              ))}
            </ul>
          </div>
          <div className="flex flex-col gap-3">
            <CopyBox
              multiline
              value={`git clone ${GITHUB_URL}.git\ncd pinpop\ncp .env.example .env\ndocker compose up -d`}
            />
            <p className="text-sm text-muted">{t("landing.selfHostNote")}</p>
          </div>
        </div>
      </PageContainer>

      {/* Final CTA */}
      <PageContainer className="pb-8">
        <div className="relative overflow-hidden rounded-[2rem] border-2 border-ink-900 bg-gradient-to-br from-pop-500 to-tang-500 px-6 py-14 text-center text-white shadow-pop dark:border-black">
          <div className="absolute inset-0 text-white/15 bg-dots" aria-hidden />
          <div className="relative flex flex-col items-center gap-6">
            <h2 className="max-w-2xl text-4xl font-extrabold text-balance sm:text-5xl">{t("landing.finalTitle")}</h2>
            <div className="flex flex-wrap justify-center gap-3">
              <Button variant="dark" size="lg" onClick={() => navigate(user ? "/dashboard" : "/register")}>
                {t("landing.createCta")}
              </Button>
              <Button variant="sun" size="lg" onClick={() => navigate("/join")}>
                {t("landing.joinCta")}
              </Button>
            </div>
          </div>
        </div>
      </PageContainer>
    </div>
  );
}
