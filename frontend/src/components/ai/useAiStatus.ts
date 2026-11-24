import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export interface AiStatus {
  enabled: boolean;
  source: "user" | "instance" | null;
  provider: string | null;
  model: string | null;
  userKeysAllowed: boolean;
  dailyLimit: number | null;
  usedToday: number;
}

export function useAiStatus(enabled = true) {
  return useQuery({
    queryKey: ["ai-status"],
    queryFn: () => api.get<AiStatus>("/api/ai/status"),
    staleTime: 60_000,
    enabled,
  });
}
