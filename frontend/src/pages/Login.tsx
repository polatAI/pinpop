import { type FormEvent, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useSearchParams } from "react-router";
import { AuthCard, OAuthButtons } from "@/components/pages/AuthCard";
import { Button, Field, Input } from "@/components/ui";
import { useAuth } from "@/hooks/useAuth";
import { useErrorMessage } from "@/hooks/useErrorMessage";
import { api } from "@/lib/api";
import type { PublicUser } from "@/shared";

/** Only allow same-site relative redirects after login. */
export function safeNext(next: string | null): string {
  return next?.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
}

export default function Login() {
  const { t } = useTranslation("pages");
  const { user, setUser } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const errorMessage = useErrorMessage();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const next = safeNext(params.get("next"));

  const oauthError = params.get("error");
  useEffect(() => {
    if (user) navigate(next, { replace: true });
  }, [user, navigate, next]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await api.post<{ user: PublicUser }>("/api/auth/login", { email, password });
      setUser(res.user);
      navigate(next, { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthCard
      title={t("auth.loginTitle")}
      subtitle={t("auth.loginSubtitle")}
      footer={
        <>
          {t("auth.noAccount")}{" "}
          <Link
            to={`/register${params.get("next") ? `?next=${encodeURIComponent(next)}` : ""}`}
            className="font-semibold text-pop-600 hover:underline"
          >
            {t("auth.registerLink")}
          </Link>
        </>
      }
    >
      <OAuthButtons />
      <form onSubmit={submit} className="flex flex-col gap-4">
        {oauthError ? (
          <p
            className="rounded-2xl bg-pop-100 px-4 py-3 text-sm font-medium text-pop-800 dark:bg-pop-900/40 dark:text-pop-200"
            role="alert"
          >
            {oauthError === "registration_closed" ? t("common:errors.registration_closed") : t("auth.oauthFailed")}
          </p>
        ) : null}
        <Field label={t("auth.email")} htmlFor="email">
          <Input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        <Field label={t("auth.password")} htmlFor="password" error={error}>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        <Button type="submit" size="lg" loading={loading} className="mt-2 w-full">
          {t("auth.loginButton")}
        </Button>
      </form>
    </AuthCard>
  );
}
