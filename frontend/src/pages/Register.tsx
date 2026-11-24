import { Lock } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useSearchParams } from "react-router";
import { AuthCard, OAuthButtons } from "@/components/pages/AuthCard";
import { Button, Field, Input } from "@/components/ui";
import { useAuth, useInstance } from "@/hooks/useAuth";
import { useErrorMessage } from "@/hooks/useErrorMessage";
import { api } from "@/lib/api";
import type { PublicUser } from "@/shared";
import { safeNext } from "./Login";

export default function Register() {
  const { t } = useTranslation("pages");
  const { user, setUser } = useAuth();
  const { data: instance } = useInstance();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const errorMessage = useErrorMessage();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const next = safeNext(params.get("next"));

  useEffect(() => {
    if (user) navigate(next, { replace: true });
  }, [user, navigate, next]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (password.length < 8) {
      setError(t("auth.passwordTooShort"));
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await api.post<{ user: PublicUser }>("/api/auth/register", { name, email, password });
      setUser(res.user);
      navigate(next, { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const closed = instance && !instance.registrationOpen;

  return (
    <AuthCard
      title={t("auth.registerTitle")}
      subtitle={t("auth.registerSubtitle")}
      footer={
        <>
          {t("auth.haveAccount")}{" "}
          <Link to="/login" className="font-semibold text-pop-600 hover:underline">
            {t("auth.loginLink")}
          </Link>
        </>
      }
    >
      {closed ? (
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <Lock className="size-10 text-muted" />
          <p className="font-semibold">{t("common:errors.registration_closed")}</p>
          <p className="text-sm text-muted">{t("auth.registrationClosedHint")}</p>
        </div>
      ) : (
        <>
          <OAuthButtons />
          <form onSubmit={submit} className="flex flex-col gap-4">
            <Field label={t("auth.name")} htmlFor="name">
              <Input
                id="name"
                autoComplete="name"
                required
                maxLength={60}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </Field>
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
            <Field label={t("auth.password")} htmlFor="password" hint={t("auth.passwordHint")} error={error}>
              <Input
                id="password"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>
            <Button type="submit" size="lg" loading={loading} className="mt-2 w-full">
              {t("auth.registerButton")}
            </Button>
            <p className="text-center text-xs text-muted">{t("auth.terms")}</p>
          </form>
        </>
      )}
    </AuthCard>
  );
}
