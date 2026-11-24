import { storage } from "./utils";

/**
 * All Pinpop sounds are synthesised with the Web Audio API — no audio files, no licensing questions.
 */
type Note = { f: number; d: number; t?: OscillatorType; v?: number };

let ctx: AudioContext | null = null;
let muted = storage.get("pinpop:muted") === "1";
let lobbyTimer: number | null = null;

function audio(): AudioContext | null {
  if (muted) return null;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function play(notes: Note[], gap = 0): void {
  const ac = audio();
  if (!ac) return;
  let at = ac.currentTime + 0.01;
  for (const n of notes) {
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = n.t ?? "triangle";
    osc.frequency.setValueAtTime(n.f, at);
    const v = n.v ?? 0.18;
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(v, at + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + n.d);
    osc.connect(gain).connect(ac.destination);
    osc.start(at);
    osc.stop(at + n.d + 0.02);
    at += n.d + gap;
  }
}

export const sound = {
  isMuted: () => muted,
  setMuted(value: boolean) {
    muted = value;
    storage.set("pinpop:muted", value ? "1" : "0");
    if (value) sound.stopLobby();
  },
  join: () =>
    play([
      { f: 660, d: 0.08 },
      { f: 990, d: 0.12 },
    ]),
  tick: () => play([{ f: 1200, d: 0.04, t: "square", v: 0.05 }]),
  start: () =>
    play(
      [
        { f: 523, d: 0.1 },
        { f: 659, d: 0.1 },
        { f: 784, d: 0.1 },
        { f: 1047, d: 0.25 },
      ],
      0.02,
    ),
  answer: () => play([{ f: 880, d: 0.06, t: "sine" }]),
  correct: () =>
    play(
      [
        { f: 784, d: 0.1, t: "sine" },
        { f: 1175, d: 0.22, t: "sine" },
      ],
      0.01,
    ),
  wrong: () =>
    play([
      { f: 330, d: 0.15, t: "sawtooth", v: 0.08 },
      { f: 247, d: 0.25, t: "sawtooth", v: 0.08 },
    ]),
  reveal: () =>
    play(
      [
        { f: 392, d: 0.08 },
        { f: 523, d: 0.08 },
        { f: 659, d: 0.18 },
      ],
      0.01,
    ),
  fanfare: () =>
    play(
      [
        { f: 523, d: 0.12 },
        { f: 523, d: 0.12 },
        { f: 784, d: 0.12 },
        { f: 1047, d: 0.4 },
        { f: 988, d: 0.12 },
        { f: 1047, d: 0.5 },
      ],
      0.03,
    ),
  /** A gentle looping arpeggio for the lobby. */
  startLobby() {
    if (lobbyTimer !== null || muted) return;
    const pattern = [262, 330, 392, 523, 392, 330, 294, 349, 440, 587, 440, 349];
    let i = 0;
    lobbyTimer = window.setInterval(() => {
      const f = pattern[i % pattern.length] as number;
      play([{ f, d: 0.22, t: "sine", v: 0.06 }]);
      if (i % 4 === 0) play([{ f: f / 2, d: 0.4, t: "triangle", v: 0.05 }]);
      i++;
    }, 260);
  },
  stopLobby() {
    if (lobbyTimer !== null) window.clearInterval(lobbyTimer);
    lobbyTimer = null;
  },
};
