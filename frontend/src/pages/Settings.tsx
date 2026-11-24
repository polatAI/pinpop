import { Database, KeyRound, Plug, Sparkles, User } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router";
import { PageContainer, PageHeader } from "@/components/pages/common";
import { AiTab } from "@/components/pages/settings/AiTab";
import { ApiTab } from "@/components/pages/settings/ApiTab";
import { DataTab } from "@/components/pages/settings/DataTab";
import { ProfileTab } from "@/components/pages/settings/ProfileTab";
import { SecurityTab } from "@/components/pages/settings/SecurityTab";
import { Tabs } from "@/components/ui";
import { useAuth } from "@/hooks/useAuth";

const TABS = ["profile", "security", "ai", "api", "data"] as const;
type Tab = (typeof TABS)[number];

const parseHash = (hash: string): Tab => {
  const value = hash.replace(/^#/, "");
  return (TABS as readonly string[]).includes(value) ? (value as Tab) : "profile";
};

export default function Settings() {
  const { t } = useTranslation("pages");
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>(() => parseHash(location.hash));

  useEffect(() => setTab(parseHash(location.hash)), [location.hash]);

  if (!user) return null;

  const icons: Record<Tab, React.ReactNode> = {
    profile: <User className="size-4" />,
    security: <KeyRound className="size-4" />,
    ai: <Sparkles className="size-4" />,
    api: <Plug className="size-4" />,
    data: <Database className="size-4" />,
  };

  return (
    <PageContainer className="max-w-4xl">
      <PageHeader title={t("settings.title")} description={t("settings.subtitle")} />
      <Tabs
        value={tab}
        onChange={(v) => navigate({ hash: v }, { replace: true })}
        items={TABS.map((v) => ({ value: v, label: t(`settings.tabs.${v}`), icon: icons[v] }))}
        className="mb-6"
      />
      {tab === "profile" && <ProfileTab user={user} />}
      {tab === "security" && <SecurityTab />}
      {tab === "ai" && <AiTab />}
      {tab === "api" && <ApiTab />}
      {tab === "data" && <DataTab />}
    </PageContainer>
  );
}
