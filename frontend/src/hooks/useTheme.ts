import { useCallback, useSyncExternalStore } from "react";
import { storage } from "@/lib/utils";

const listeners = new Set<() => void>();
const isDark = () => document.documentElement.classList.contains("dark");

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function setTheme(theme: "light" | "dark") {
  document.documentElement.classList.toggle("dark", theme === "dark");
  storage.set("pinpop:theme", theme);
  for (const l of listeners) l();
}

export function useTheme() {
  const dark = useSyncExternalStore(subscribe, isDark, () => false);
  const toggle = useCallback(() => setTheme(isDark() ? "light" : "dark"), []);
  return { dark, toggle, setTheme };
}
