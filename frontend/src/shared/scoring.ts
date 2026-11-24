import { z } from "zod";
import { type Question, type QuestionOf, SCORED_TYPES } from "./quiz";

const id = z.string().min(1).max(64);

export const answerSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("quiz"), choiceId: id }),
  z.object({ type: z.literal("multi"), choiceIds: z.array(id).min(1).max(6) }),
  z.object({ type: z.literal("truefalse"), value: z.boolean() }),
  z.object({ type: z.literal("type"), text: z.string().max(80) }),
  z.object({ type: z.literal("slider"), value: z.number().finite() }),
  z.object({ type: z.literal("order"), itemIds: z.array(id).min(2).max(6) }),
  z.object({ type: z.literal("poll"), choiceId: id }),
  z.object({ type: z.literal("wordcloud"), text: z.string().trim().min(1).max(40) }),
]);
export type Answer = z.infer<typeof answerSchema>;

export interface Evaluation {
  /** null for opinion questions (poll, word cloud). */
  correct: boolean | null;
  /** 0..1 share of the question's points earned before time and streak adjustments. */
  ratio: number;
}

/** Lower-cases, trims, collapses whitespace and strips diacritics so "İstanbul " matches "istanbul". */
export function normalizeText(value: string): string {
  return value
    .replace(/İ/g, "i")
    .replace(/I/g, "i")
    .replace(/ı/g, "i")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function evaluateAnswer(question: Question, answer: Answer): Evaluation {
  if (question.type !== answer.type) return { correct: false, ratio: 0 };

  switch (question.type) {
    case "quiz": {
      const a = answer as Extract<Answer, { type: "quiz" }>;
      const ok = question.choices.some((c) => c.id === a.choiceId && c.correct);
      return { correct: ok, ratio: ok ? 1 : 0 };
    }
    case "multi": {
      const a = answer as Extract<Answer, { type: "multi" }>;
      const selected = new Set(a.choiceIds);
      const correctIds = new Set(question.choices.filter((c) => c.correct).map((c) => c.id));
      let hits = 0;
      let misses = 0;
      for (const sel of selected) {
        if (correctIds.has(sel)) hits++;
        else misses++;
      }
      const exact = misses === 0 && hits === correctIds.size;
      const ratio = Math.max(0, (hits - misses) / correctIds.size);
      return { correct: exact, ratio: exact ? 1 : ratio };
    }
    case "truefalse": {
      const a = answer as Extract<Answer, { type: "truefalse" }>;
      const ok = a.value === question.correct;
      return { correct: ok, ratio: ok ? 1 : 0 };
    }
    case "type": {
      const a = answer as Extract<Answer, { type: "type" }>;
      const given = normalizeText(a.text);
      const ok = given.length > 0 && question.acceptedAnswers.some((x) => normalizeText(x) === given);
      return { correct: ok, ratio: ok ? 1 : 0 };
    }
    case "slider": {
      const a = answer as Extract<Answer, { type: "slider" }>;
      return evaluateSlider(question, a.value);
    }
    case "order": {
      const a = answer as Extract<Answer, { type: "order" }>;
      const expected = question.items.map((i) => i.id);
      if (a.itemIds.length !== expected.length) return { correct: false, ratio: 0 };
      const inPlace = expected.filter((itemId, idx) => a.itemIds[idx] === itemId).length;
      const exact = inPlace === expected.length;
      // Partial credit is deliberately modest so guessing an order is not rewarded much.
      return { correct: exact, ratio: exact ? 1 : (inPlace / expected.length) * 0.5 };
    }
    case "poll":
    case "wordcloud":
      return { correct: null, ratio: 0 };
  }
}

function evaluateSlider(q: QuestionOf<"slider">, value: number): Evaluation {
  const diff = Math.abs(value - q.correct);
  if (diff <= q.tolerance) return { correct: true, ratio: 1 };
  // Near misses within a quarter of the range earn up to half points.
  const fadeRange = (q.max - q.min) / 4;
  const ratio = fadeRange > 0 ? Math.max(0, 1 - (diff - q.tolerance) / fadeRange) * 0.5 : 0;
  return { correct: false, ratio };
}

export const BASE_POINTS = 1000;
export const STREAK_BONUS = 100;
export const MAX_STREAK_BONUS_STEPS = 5;

export interface ScoreInput {
  question: Question;
  evaluation: Evaluation;
  elapsedMs: number;
  timeLimitMs: number;
  /** Streak including this answer (1 = first correct answer in a row). */
  streak: number;
}

/**
 * Faster answers earn more: answering instantly gives 100% of the points,
 * answering at the buzzer gives 50%. Correct streaks add a capped bonus.
 */
export function computePoints({ question, evaluation, elapsedMs, timeLimitMs, streak }: ScoreInput): number {
  if (!SCORED_TYPES.has(question.type) || question.points === "none") return 0;
  if (evaluation.ratio <= 0) return 0;
  const multiplier = question.points === "double" ? 2 : 1;
  const progress = Math.min(1, Math.max(0, elapsedMs / Math.max(1, timeLimitMs)));
  const speedFactor = 1 - progress / 2;
  const base = BASE_POINTS * multiplier * evaluation.ratio * speedFactor;
  const bonus = evaluation.correct
    ? Math.min(Math.max(0, streak - 1), MAX_STREAK_BONUS_STEPS) * STREAK_BONUS * multiplier
    : 0;
  return Math.round(base + bonus);
}

/** Checks that an answer references only ids present in the question. */
export function isAnswerWellFormed(question: Question, answer: Answer): boolean {
  if (question.type !== answer.type) return false;
  switch (answer.type) {
    case "quiz":
    case "poll": {
      const q = question as QuestionOf<"quiz" | "poll">;
      return q.choices.some((c) => c.id === answer.choiceId);
    }
    case "multi": {
      const q = question as QuestionOf<"multi">;
      const ids = new Set(q.choices.map((c) => c.id));
      return answer.choiceIds.every((x) => ids.has(x)) && new Set(answer.choiceIds).size === answer.choiceIds.length;
    }
    case "order": {
      const q = question as QuestionOf<"order">;
      const ids = new Set(q.items.map((i) => i.id));
      return (
        answer.itemIds.length === ids.size &&
        new Set(answer.itemIds).size === ids.size &&
        answer.itemIds.every((x) => ids.has(x))
      );
    }
    case "slider": {
      const q = question as QuestionOf<"slider">;
      return answer.value >= q.min && answer.value <= q.max;
    }
    case "wordcloud": {
      const q = question as QuestionOf<"wordcloud">;
      return answer.text.length <= q.maxLength;
    }
    default:
      return true;
  }
}
