import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button, Card, Field, Input, Select, Switch } from "@/components/ui";
import { useAuth } from "@/hooks/useAuth";
import { useErrorMessage } from "@/hooks/useErrorMessage";
import { useTheme } from "@/hooks/useTheme";
import { api } from "@/lib/api";
import { LANGUAGES } from "@/lib/i18n";
import type { PublicUser } from "@/shared";

export function ProfileTab({ user }: { user: PublicUser }) {
  const { t, i18n } = useTranslation("pages");
  const { setUser } = useAuth();
  const { dark, setTheme } = useTheme();
  const errorMessage = useErrorMessage();
  const [name, setName] = useState(user.name);
  const [locale, setLocale] = useState(LANGUAGES.some((l) => l.code === user.locale) ? user.locale : i18n.language);
  const [saving, setSaving] = useState(false);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await api.patch<{ user: PublicUser }>("/api/me", { name: name.trim(), locale });
      setUser(res.user);
      await i18n.changeLanguage(locale);
      toast.success(t("settings.saved"));
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <h2 className="mb-5 text-xl font-bold">{t("settings.profile.title")}</h2>
        <form onSubmit={save} className="flex max-w-lg flex-col gap-4">
          <Field label={t("settings.profile.email")} hint={t("settings.profile.emailHint")}>
            <Input value={user.email} disabled readOnly />
          </Field>
          <Field label={t("auth.name")} htmlFor="profile-name">
            <Input id="profile-name" value={name} required maxLength={60} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label={t("common:language")} htmlFor="profile-lang">
            <Select id="profile-lang" value={locale} onChange={(e) => setLocale(e.target.value)}>
              {LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.label}
                </option>
              ))}
            </Select>
          </Field>
          <div>
            <Button type="submit" loading={saving} disabled={!name.trim()}>
              {t("common:actions.save")}
            </Button>
          </div>
        </form>
      </Card>
      <Card>
        <h2 className="mb-3 text-xl font-bold">{t("settings.profile.appearance")}</h2>
        <div className="max-w-lg">
          <Switch
            checked={dark}
            onChange={(v) => setTheme(v ? "dark" : "light")}
            label={t("settings.profile.darkMode")}
            description={t("settings.profile.darkModeHint")}
          />
        </div>
      </Card>
    </div>
  );
}
