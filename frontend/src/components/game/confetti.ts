import confetti from "canvas-confetti";

const COLORS = ["#ff3d68", "#ffb81c", "#1f9bff", "#12b886", "#ff7ac6", "#ff8a3d"];

function reduced(): boolean {
  return typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function burst(): void {
  if (reduced()) return;
  void confetti({ particleCount: 120, spread: 80, origin: { y: 0.6 }, colors: COLORS });
}

/** A few seconds of confetti from both sides, for the podium. */
export function celebrate(durationMs = 3500): void {
  if (reduced()) return;
  const end = Date.now() + durationMs;
  const frame = () => {
    void confetti({ particleCount: 4, angle: 60, spread: 60, origin: { x: 0 }, colors: COLORS });
    void confetti({ particleCount: 4, angle: 120, spread: 60, origin: { x: 1 }, colors: COLORS });
    if (Date.now() < end) requestAnimationFrame(frame);
  };
  frame();
}
