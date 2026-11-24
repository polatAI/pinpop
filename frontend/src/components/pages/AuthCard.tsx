import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Card } from "@/components/ui";
import { GithubIcon } from "@/components/ui/GithubIcon";
import { LogoMark } from "@/components/ui/Logo";
import { useInstance } from "@/hooks/useAuth";

export function AuthCard({
  title,
  subtitle,
  children,
  footer,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="relative flex min-h-[calc(100dvh-10rem)] items-center justify-center px-4 py-12">
      <div className="absolute inset-0 text-pop-500/10 bg-dots" aria-hidden />
      <div className="relative w-full max-w-md">
        <div className="mb-6 flex flex-col items-center text-center">
          <LogoMark className="mb-3 size-14 animate-[float_6s_ease-in-out_infinite]" />
          <h1 className="text-3xl font-extrabold">{title}</h1>
          {subtitle ? <p className="mt-2 text-muted">{subtitle}</p> : null}
        </div>
        <Card className="border-ink-900 shadow-pop dark:border-ink-600">{children}</Card>
        {footer ? <div className="mt-6 text-center text-sm text-muted">{footer}</div> : null}
      </div>
    </div>
  );
}

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path
        fill="#4285F4"
        d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.4h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.2-2.1 3.5-5.1 3.5-8.7z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.2 0 6-1.1 7.9-2.9l-3.9-3c-1.1.7-2.4 1.2-4 1.2-3.1 0-5.7-2.1-6.6-4.9h-4v3.1A12 12 0 0 0 12 24z"
      />
      <path fill="#FBBC05" d="M5.4 14.4a7.2 7.2 0 0 1 0-4.7V6.6h-4a12 12 0 0 0 0 10.9l4-3.1z" />
      <path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.4 6.6l4 3.1C6.3 6.9 8.9 4.8 12 4.8z" />
    </svg>
  );
}

export function OAuthButtons() {
  const { t } = useTranslation("pages");
  const { data } = useInstance();
  if (!data?.oauth.github && !data?.oauth.google) return null;
  const btn =
    "flex h-11 w-full items-center justify-center gap-2 rounded-2xl border-2 border-border bg-surface font-semibold transition-colors hover:border-ink-900 dark:hover:border-ink-600";
  return (
    <div className="flex flex-col gap-2">
      {data.oauth.github ? (
        <a href="/api/auth/oauth/github" className={btn}>
          <GithubIcon className="size-5" /> {t("auth.withGithub")}
        </a>
      ) : null}
      {data.oauth.google ? (
        <a href="/api/auth/oauth/google" className={btn}>
          <GoogleIcon className="size-5" /> {t("auth.withGoogle")}
        </a>
      ) : null}
      <div className="my-3 flex items-center gap-3 text-xs font-semibold text-muted uppercase">
        <span className="h-0.5 flex-1 bg-border" />
        {t("auth.or")}
        <span className="h-0.5 flex-1 bg-border" />
      </div>
    </div>
  );
}
