import { useEffect, useRef, useState } from "react";

/**
 * Remaining milliseconds until `deadline` (server epoch ms), corrected for the clock offset
 * between this device and the server. `serverNow` is the server time when the view was sent.
 */
export function useCountdown(deadline: number | null, serverNow: number, paused = false): number {
  const offset = useRef(0);
  const [now, setNow] = useState(() => Date.now());

  // Recompute the offset whenever a new view arrives.
  useEffect(() => {
    offset.current = serverNow - Date.now();
  }, [serverNow]);

  useEffect(() => {
    if (deadline === null || paused) return;
    const id = window.setInterval(() => setNow(Date.now()), 100);
    return () => window.clearInterval(id);
  }, [deadline, paused]);

  if (deadline === null) return 0;
  return Math.max(0, deadline - (now + offset.current));
}

/** Calls `fn` once per whole second change while counting down through the last `from` seconds. */
export function useLastSecondsTick(remainingMs: number, active: boolean, fn: () => void, from = 5): void {
  const last = useRef<number | null>(null);
  const seconds = Math.ceil(remainingMs / 1000);
  useEffect(() => {
    if (!active) {
      last.current = null;
      return;
    }
    if (seconds > 0 && seconds <= from && last.current !== seconds) fn();
    last.current = seconds;
  }, [seconds, active, fn, from]);
}

export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  useEffect(() => {
    const mq = matchMedia("(prefers-reduced-motion: reduce)");
    const on = () => setReduced(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return reduced;
}
