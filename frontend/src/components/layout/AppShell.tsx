import { BarChart3, Compass, Languages, LayoutGrid, LogOut, Menu, Moon, Settings, Shield, Sun, X } from "lucide-react";
import { type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, NavLink, Outlet, useNavigate } from "react-router";
import { Button } from "@/components/ui";
import { GithubIcon } from "@/components/ui/GithubIcon";
import { Logo } from "@/components/ui/Logo";
import { useAuth } from "@/hooks/useAuth";
import { useTheme } from "@/hooks/useTheme";
import { LANGUAGES } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export const GITHUB_URL = "https://github.com/polatAI/pinpop";

export function ThemeToggle({ className }: { className?: string }) {
  const { dark, toggle } = useTheme();
  const { t } = useTranslation();
  return (
    <button
      type="button"
      onClick={toggle}
      className={cn("rounded-xl p-2 text-muted hover:bg-surface-2 hover:text-fg", className)}
      aria-label={t("theme.toggle")}
      title={t("theme.toggle")}
    >
      {dark ? <Sun className="size-5" /> : <Moon className="size-5" />}
    </button>
  );
}

export function LanguageSwitcher({ className }: { className?: string }) {
  const { i18n, t } = useTranslation();
  return (
    <label
      className={cn(
        "relative inline-flex items-center rounded-xl text-muted hover:bg-surface-2 hover:text-fg",
        className,
      )}
    >
      <Languages className="pointer-events-none absolute left-2 size-5" aria-hidden />
      <span className="sr-only">{t("language")}</span>
      <select
        value={i18n.language}
        onChange={(e) => void i18n.changeLanguage(e.target.value)}
        className="cursor-pointer appearance-none bg-transparent py-2 pr-2 pl-9 text-sm font-semibold focus:outline-none"
      >
        {LANGUAGES.map((l) => (
          <option key={l.code} value={l.code}>
            {l.code.toUpperCase()}
          </option>
        ))}
      </select>
    </label>
  );
}

function NavItem({
  to,
  icon,
  children,
  onClick,
}: {
  to: string;
  icon: ReactNode;
  children: ReactNode;
  onClick?: () => void;
}) {
  return (
    <NavLink
      to={to}
      onClick={onClick}
      className={({ isActive }) =>
        cn(
          "inline-flex items-center gap-2 rounded-xl px-3 py-2 text-[15px] font-semibold transition-colors",
          isActive
            ? "bg-pop-100 text-pop-700 dark:bg-pop-900/40 dark:text-pop-200"
            : "text-muted hover:bg-surface-2 hover:text-fg",
        )
      }
    >
      {icon}
      {children}
    </NavLink>
  );
}

export function Footer() {
  const { t } = useTranslation();
  return (
    <footer className="mt-16 border-t-2 border-border">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-4 py-8 text-sm text-muted sm:flex-row sm:px-6">
        <div className="flex items-center gap-3">
          <Logo size="sm" />
          <span>{t("footer.openSource")}</span>
        </div>
        <div className="flex items-center gap-5">
          <a href="/api/docs" className="hover:text-fg">
            {t("nav.apiDocs")}
          </a>
          <a href={`${GITHUB_URL}#readme`} className="hover:text-fg" target="_blank" rel="noreferrer">
            {t("footer.selfHost")}
          </a>
          <a
            href={GITHUB_URL}
            className="inline-flex items-center gap-1.5 hover:text-fg"
            target="_blank"
            rel="noreferrer"
          >
            <GithubIcon className="size-4" /> {t("nav.github")}
          </a>
        </div>
      </div>
    </footer>
  );
}

/** Header + footer layout used by all regular (non-game) pages. */
export function AppShell() {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  const links = user ? (
    <>
      <NavItem to="/dashboard" icon={<LayoutGrid className="size-4" />} onClick={close}>
        {t("nav.dashboard")}
      </NavItem>
      <NavItem to="/discover" icon={<Compass className="size-4" />} onClick={close}>
        {t("nav.discover")}
      </NavItem>
      <NavItem to="/reports" icon={<BarChart3 className="size-4" />} onClick={close}>
        {t("nav.reports")}
      </NavItem>
      {user.role === "admin" ? (
        <NavItem to="/admin" icon={<Shield className="size-4" />} onClick={close}>
          {t("nav.admin")}
        </NavItem>
      ) : null}
    </>
  ) : (
    <NavItem to="/discover" icon={<Compass className="size-4" />} onClick={close}>
      {t("nav.discover")}
    </NavItem>
  );

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-30 border-b-2 border-border bg-bg/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6">
          <Link to={user ? "/dashboard" : "/"} className="shrink-0" aria-label="Pinpop home">
            <Logo />
          </Link>
          <nav className="ml-4 hidden items-center gap-1 md:flex">{links}</nav>
          <div className="ml-auto flex items-center gap-1">
            <Button variant="sun" size="sm" onClick={() => navigate("/join")} className="hidden sm:inline-flex">
              {t("nav.join")}
            </Button>
            <LanguageSwitcher className="hidden sm:inline-flex" />
            <ThemeToggle />
            {user ? (
              <div className="hidden items-center gap-1 md:flex">
                <NavLink
                  to="/settings"
                  className="flex items-center gap-2 rounded-xl px-2 py-1.5 hover:bg-surface-2"
                  title={t("nav.settings")}
                >
                  <span className="grid size-8 place-items-center rounded-full bg-gradient-to-br from-pop-500 to-tang-500 text-sm font-bold text-white">
                    {user.name.slice(0, 1).toUpperCase()}
                  </span>
                  <Settings className="size-4 text-muted" />
                </NavLink>
                <button
                  type="button"
                  className="rounded-xl p-2 text-muted hover:bg-surface-2 hover:text-fg"
                  title={t("nav.logout")}
                  aria-label={t("nav.logout")}
                  onClick={async () => {
                    await logout();
                    navigate("/");
                  }}
                >
                  <LogOut className="size-5" />
                </button>
              </div>
            ) : (
              <div className="hidden items-center gap-2 md:flex">
                <Button variant="ghost" size="sm" onClick={() => navigate("/login")}>
                  {t("nav.login")}
                </Button>
                <Button size="sm" onClick={() => navigate("/register")}>
                  {t("nav.register")}
                </Button>
              </div>
            )}
            <button
              type="button"
              className="rounded-xl p-2 md:hidden"
              onClick={() => setOpen((v) => !v)}
              aria-label="Menu"
              aria-expanded={open}
            >
              {open ? <X className="size-6" /> : <Menu className="size-6" />}
            </button>
          </div>
        </div>
        {open ? (
          <div className="border-t-2 border-border px-4 py-3 md:hidden">
            <nav className="flex flex-col gap-1">
              {links}
              <NavItem to="/join" icon={<span>🎮</span>} onClick={close}>
                {t("nav.join")}
              </NavItem>
              {user ? (
                <>
                  <NavItem to="/settings" icon={<Settings className="size-4" />} onClick={close}>
                    {t("nav.settings")}
                  </NavItem>
                  <button
                    type="button"
                    className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-left font-semibold text-muted hover:bg-surface-2"
                    onClick={async () => {
                      close();
                      await logout();
                      navigate("/");
                    }}
                  >
                    <LogOut className="size-4" /> {t("nav.logout")}
                  </button>
                </>
              ) : (
                <>
                  <NavItem to="/login" icon={null} onClick={close}>
                    {t("nav.login")}
                  </NavItem>
                  <NavItem to="/register" icon={null} onClick={close}>
                    {t("nav.register")}
                  </NavItem>
                </>
              )}
              <LanguageSwitcher className="self-start" />
            </nav>
          </div>
        ) : null}
      </header>
      <main className="flex-1">
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}

/** Wraps pages that need a logged-in user. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  if (loading) return null;
  if (!user) {
    const next = encodeURIComponent(window.location.pathname + window.location.search);
    queueMicrotask(() => navigate(`/login?next=${next}`, { replace: true }));
    return null;
  }
  return <>{children}</>;
}
