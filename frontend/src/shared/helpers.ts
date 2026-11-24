import type { PublicQuestion, PublicQuestionWithMeta } from "./game";
import type { Question } from "./quiz";

export function shuffle<T>(items: readonly T[], random: () => number = Math.random): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j] as T, out[i] as T];
  }
  return out;
}

/** Shuffles order items until the order differs from the solution (when possible). */
export function shuffleOrderItems<T extends { id: string }>(items: readonly T[], random?: () => number): T[] {
  if (items.length < 2) return [...items];
  for (let attempt = 0; attempt < 10; attempt++) {
    const out = shuffle(items, random);
    if (out.some((item, idx) => item.id !== items[idx]?.id)) return out;
  }
  return [...items].reverse();
}

export function toPublicQuestion(q: Question): PublicQuestionWithMeta {
  const meta = {
    id: q.id,
    text: q.text,
    image: q.image ?? null,
    timeLimit: q.timeLimit,
    points: q.points,
  };
  let pub: PublicQuestion;
  switch (q.type) {
    case "quiz":
    case "multi":
    case "poll":
      pub = { type: q.type, choices: q.choices.map(({ id, text }) => ({ id, text })) };
      break;
    case "truefalse":
      pub = { type: "truefalse" };
      break;
    case "type":
      pub = { type: "type", maxLength: 80 };
      break;
    case "slider":
      pub = { type: "slider", min: q.min, max: q.max, step: q.step, unit: q.unit ?? null };
      break;
    case "order":
      pub = { type: "order", items: q.items.map(({ id, text }) => ({ id, text })) };
      break;
    case "wordcloud":
      pub = { type: "wordcloud", maxLength: q.maxLength };
      break;
  }
  return { ...meta, ...pub };
}

/** Short random id suitable for questions and choices. */
export function shortId(length = 10): string {
  const alphabet = "abcdefghijkmnopqrstuvwxyz23456789";
  const bytes = new Uint8Array(length);
  globalThis.crypto.getRandomValues(bytes);
  let out = "";
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return out;
}

const ADJECTIVES = [
  "Brave",
  "Cosmic",
  "Dizzy",
  "Electric",
  "Fuzzy",
  "Giant",
  "Happy",
  "Jolly",
  "Lucky",
  "Mighty",
  "Neon",
  "Quick",
  "Rapid",
  "Sneaky",
  "Sunny",
  "Turbo",
  "Witty",
  "Zesty",
  "Bouncy",
  "Clever",
];
const NOUNS = [
  "Otter",
  "Panda",
  "Comet",
  "Pickle",
  "Waffle",
  "Rocket",
  "Llama",
  "Noodle",
  "Pixel",
  "Mango",
  "Falcon",
  "Taco",
  "Badger",
  "Muffin",
  "Penguin",
  "Wizard",
  "Koala",
  "Cactus",
  "Dragon",
  "Bubble",
];

export function randomNickname(random: () => number = Math.random): string {
  const a = ADJECTIVES[Math.floor(random() * ADJECTIVES.length)];
  const n = NOUNS[Math.floor(random() * NOUNS.length)];
  return `${a}${n}`;
}

export function formatPin(pin: string): string {
  return pin.length === 6 ? `${pin.slice(0, 3)} ${pin.slice(3)}` : pin;
}

/** Strips control characters and squashes whitespace in a nickname. Returns "" when unusable. */
export function sanitizeNickname(input: string): string {
  return input
    .replace(/[\p{C}]/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 20);
}

type Loose = Record<string, unknown>;

/**
 * Assigns ids to questions, choices and order items that do not have one yet, so that
 * API clients (and AI agents) can send questions without inventing ids themselves.
 */
export function withGeneratedIds<T>(quizLike: T): T {
  if (!quizLike || typeof quizLike !== "object") return quizLike;
  const q = quizLike as Loose;
  if (!Array.isArray(q.questions)) return quizLike;
  return { ...q, questions: q.questions.map(questionWithIds) } as T;
}

export function questionWithIds(question: unknown): unknown {
  if (!question || typeof question !== "object") return question;
  const q = { ...(question as Loose) };
  if (typeof q.id !== "string" || !q.id) q.id = shortId();
  for (const key of ["choices", "items"] as const) {
    if (Array.isArray(q[key])) {
      q[key] = (q[key] as unknown[]).map((c) =>
        c && typeof c === "object" && !(c as Loose).id ? { ...(c as Loose), id: shortId(6) } : c,
      );
    }
  }
  return q;
}
