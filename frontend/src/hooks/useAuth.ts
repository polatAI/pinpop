import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { api } from "@/lib/api";
import type { InstanceInfo, PublicUser } from "@/shared";

export function useAuth() {
  const query = useQuery({
    queryKey: ["me"],
    queryFn: () => api.get<{ user: PublicUser | null }>("/api/auth/me"),
    staleTime: 60_000,
  });
  const client = useQueryClient();
  const setUser = useCallback((user: PublicUser | null) => client.setQueryData(["me"], { user }), [client]);
  const logout = useCallback(async () => {
    await api.post("/api/auth/logout");
    client.clear();
    client.setQueryData(["me"], { user: null });
  }, [client]);
  return { user: query.data?.user ?? null, loading: query.isLoading, setUser, logout };
}

export function useInstance() {
  return useQuery({
    queryKey: ["instance"],
    queryFn: () => api.get<InstanceInfo>("/api/instance"),
    staleTime: 5 * 60_000,
  });
}

/** False when the server has no AI provider and doesn't let users add their own key: AI features are hidden. */
export function useAiAvailable(): boolean {
  const { data } = useInstance();
  return Boolean(data && (data.ai.enabled || data.ai.userKeysAllowed));
}
