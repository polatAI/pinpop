import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity, BookOpen, Cpu, Gamepad2, ShieldAlert, Trash2, Users } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/pages/ConfirmDialog";
import { PageContainer, PageHeader, StatTile } from "@/components/pages/common";
import { Badge, EmptyState, Select, Spinner } from "@/components/ui";
import { useAuth } from "@/hooks/useAuth";
import { useErrorMessage } from "@/hooks/useErrorMessage";
import { api } from "@/lib/api";
import { formatDate, formatNumber } from "@/lib/utils";
import type { PublicUser } from "@/shared";

interface AdminStats {
  users: number;
  quizzes: number;
  gamesPlayed: number;
  liveGames: number;
  memoryMb: number;
  uptimeSeconds: number;
}

function uptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export default function Admin() {
  const { t, i18n } = useTranslation("pages");
  const { user } = useAuth();
  const client = useQueryClient();
  const errorMessage = useErrorMessage();
  const [toDelete, setToDelete] = useState<PublicUser | null>(null);
  const isAdmin = user?.role === "admin";

  const stats = useQuery({
    queryKey: ["admin-stats"],
    queryFn: () => api.get<AdminStats>("/api/admin/stats"),
    enabled: isAdmin,
    refetchInterval: 15_000,
  });
  const users = useQuery({
    queryKey: ["admin-users"],
    queryFn: () => api.get<{ items: PublicUser[] }>("/api/admin/users"),
    enabled: isAdmin,
  });

  if (!isAdmin) {
    return (
      <PageContainer>
        <EmptyState
          icon={<ShieldAlert className="mx-auto size-10 text-muted" />}
          title={t("admin.forbidden")}
          description={t("admin.forbiddenText")}
        />
      </PageContainer>
    );
  }

  const setRole = async (id: string, role: "admin" | "user") => {
    try {
      await api.patch(`/api/admin/users/${id}`, { role });
      await client.invalidateQueries({ queryKey: ["admin-users"] });
      toast.success(t("settings.saved"));
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const remove = async () => {
    if (!toDelete) return;
    try {
      await api.delete(`/api/admin/users/${toDelete.id}`);
      setToDelete(null);
      await Promise.all([
        client.invalidateQueries({ queryKey: ["admin-users"] }),
        client.invalidateQueries({ queryKey: ["admin-stats"] }),
      ]);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const s = stats.data;
  const fmt = (n: number) => formatNumber(n, i18n.language);

  return (
    <PageContainer>
      <PageHeader title={t("admin.title")} description={t("admin.subtitle")} />
      {s ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <StatTile label={t("admin.users")} value={fmt(s.users)} icon={<Users className="size-6" />} tone="pop" />
          <StatTile
            label={t("admin.quizzes")}
            value={fmt(s.quizzes)}
            icon={<BookOpen className="size-6" />}
            tone="blue"
          />
          <StatTile
            label={t("admin.gamesPlayed")}
            value={fmt(s.gamesPlayed)}
            icon={<Gamepad2 className="size-6" />}
            tone="green"
          />
          <StatTile
            label={t("admin.liveGames")}
            value={fmt(s.liveGames)}
            icon={<Activity className="size-6" />}
            tone="sun"
          />
          <StatTile
            label={t("admin.memory")}
            value={`${s.memoryMb} MB`}
            icon={<Cpu className="size-6" />}
            tone="blue"
          />
          <StatTile
            label={t("admin.uptime")}
            value={uptime(s.uptimeSeconds)}
            icon={<Activity className="size-6" />}
            tone="pop"
          />
        </div>
      ) : (
        <Spinner />
      )}

      <h2 className="mt-10 mb-4 text-2xl font-extrabold">{t("admin.usersTitle")}</h2>
      {users.isLoading ? (
        <Spinner />
      ) : (
        <div className="overflow-x-auto rounded-3xl border-2 border-border bg-surface">
          <table className="w-full min-w-[640px] text-left">
            <thead className="border-b-2 border-border text-xs font-bold tracking-wide text-muted uppercase">
              <tr>
                <th className="px-5 py-3">{t("admin.name")}</th>
                <th className="px-3 py-3">{t("admin.email")}</th>
                <th className="px-3 py-3">{t("admin.joined")}</th>
                <th className="px-3 py-3">{t("admin.role")}</th>
                <th className="w-12 px-3 py-3" />
              </tr>
            </thead>
            <tbody>
              {users.data?.items.map((u) => {
                const self = u.id === user.id;
                return (
                  <tr key={u.id} className="border-b-2 border-border last:border-b-0">
                    <td className="px-5 py-3 font-semibold">
                      {u.name} {self ? <Badge tone="pop">{t("admin.you")}</Badge> : null}
                    </td>
                    <td className="px-3 py-3 text-sm text-muted">{u.email}</td>
                    <td className="px-3 py-3 text-sm text-muted">{formatDate(u.createdAt, i18n.language)}</td>
                    <td className="px-3 py-3">
                      <Select
                        value={u.role}
                        disabled={self}
                        onChange={(e) => void setRole(u.id, e.target.value as "admin" | "user")}
                        className="h-9 w-32 text-sm"
                        aria-label={t("admin.role")}
                      >
                        <option value="user">{t("admin.roleUser")}</option>
                        <option value="admin">{t("admin.roleAdmin")}</option>
                      </Select>
                    </td>
                    <td className="px-3 py-3">
                      {!self ? (
                        <button
                          type="button"
                          onClick={() => setToDelete(u)}
                          className="rounded-xl p-2 text-muted hover:bg-surface-2 hover:text-[#e5383b]"
                          aria-label={t("common:actions.delete")}
                        >
                          <Trash2 className="size-4" />
                        </button>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <ConfirmDialog
        open={toDelete !== null}
        onClose={() => setToDelete(null)}
        onConfirm={remove}
        title={t("admin.deleteTitle", { name: toDelete?.name ?? "" })}
        description={t("admin.deleteText")}
      />
    </PageContainer>
  );
}
