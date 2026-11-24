import { z } from "zod";
import { gameSettingsSchema, type PublicQuestionWithMeta } from "./game";
import { QUESTION_TYPES, type Question } from "./quiz";

export const registerSchema = z.object({
  name: z.string().trim().min(1).max(60),
  email: z
    .email()
    .max(254)
    .transform((v) => v.toLowerCase()),
  password: z.string().min(8).max(200),
});

export const loginSchema = z.object({
  email: z
    .email()
    .max(254)
    .transform((v) => v.toLowerCase()),
  password: z.string().min(1).max(200),
});

export const updateProfileSchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  locale: z.string().min(2).max(10).optional(),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: z.string().min(8).max(200),
});

export interface PublicUser {
  id: string;
  email: string;
  name: string;
  role: "admin" | "user";
  locale: string;
  avatarUrl: string | null;
  createdAt: string;
}

export const AI_PROVIDERS = ["anthropic", "openai", "openrouter", "ollama", "openai-compatible"] as const;
export type AiProvider = (typeof AI_PROVIDERS)[number];

export const aiSettingsSchema = z.object({
  provider: z.enum(AI_PROVIDERS),
  model: z.string().trim().max(120).optional(),
  apiKey: z.string().trim().max(500).optional(),
  baseUrl: z.url().max(500).optional(),
});
export type AiSettingsInput = z.infer<typeof aiSettingsSchema>;

export const DIFFICULTIES = ["easy", "medium", "hard", "mixed"] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

export const aiGenerateSchema = z.object({
  /** Topic or instruction, e.g. "Photosynthesis for 7th graders". */
  topic: z.string().trim().max(500).optional(),
  /** Source material: lesson notes, article text etc. */
  sourceText: z.string().max(60_000).optional(),
  /** Public web page to build questions from. */
  sourceUrl: z.url().max(2000).optional(),
  count: z.number().int().min(1).max(30).default(10),
  difficulty: z.enum(DIFFICULTIES).default("medium"),
  language: z.string().min(2).max(40).default("en"),
  types: z.array(z.enum(QUESTION_TYPES)).min(1).default(["quiz", "truefalse"]),
  timeLimit: z.number().int().min(5).max(240).default(20),
  audience: z.string().max(120).optional(),
  /** Save as a new quiz and return its id. */
  save: z.boolean().default(false),
});
export type AiGenerateInput = z.input<typeof aiGenerateSchema>;

export const AI_IMPROVE_ACTIONS = ["harder", "easier", "distractors", "explain", "rephrase", "translate"] as const;
export const aiImproveSchema = z.object({
  action: z.enum(AI_IMPROVE_ACTIONS),
  question: z.unknown(),
  language: z.string().min(2).max(40).optional(),
});

export const createGameSchema = z.object({
  quizId: z.string().min(1),
  settings: gameSettingsSchema.partial().optional(),
});

export interface CreatedGame {
  pin: string;
  hostToken: string;
  hostUrl: string;
  joinUrl: string;
}

export interface GameReportSummary {
  id: string;
  quizId: string | null;
  quizTitle: string;
  pin: string;
  playerCount: number;
  questionCount: number;
  startedAt: string;
  endedAt: string | null;
  averageAccuracy: number;
}

export interface GameReportPlayer {
  nickname: string;
  avatar: string;
  score: number;
  rank: number;
  correctCount: number;
  answers: {
    questionIndex: number;
    correct: boolean | null;
    points: number;
    timeMs: number | null;
    answer: unknown;
  }[];
}

export interface GameReport extends GameReportSummary {
  questions: Question[];
  players: GameReportPlayer[];
}

export interface ApiTokenInfo {
  id: string;
  name: string;
  prefix: string;
  lastUsedAt: string | null;
  createdAt: string;
}

export interface InstanceInfo {
  name: string;
  version: string;
  registrationOpen: boolean;
  ai: { enabled: boolean; provider: AiProvider | null; userKeysAllowed: boolean };
  oauth: { github: boolean; google: boolean };
  hosted: boolean;
  maxPlayers: number;
  publicUrl: string;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

// ---------------------------------------------------------------- assignments (self-paced homework)

export const createAssignmentSchema = z.object({
  quizId: z.string().min(1),
  title: z.string().trim().max(120).optional(),
  /** ISO date after which no new attempts are accepted. */
  deadline: z.iso.datetime().optional().nullable(),
  shuffleQuestions: z.boolean().default(false),
  shuffleAnswers: z.boolean().default(true),
  /** Show the correct answer after each question. */
  showAnswers: z.boolean().default(true),
});
export type CreateAssignmentInput = z.input<typeof createAssignmentSchema>;

export interface AssignmentSummary {
  id: string;
  code: string;
  quizId: string | null;
  title: string;
  questionCount: number;
  attemptCount: number;
  completedCount: number;
  averageScore: number;
  deadline: string | null;
  closed: boolean;
  createdAt: string;
  url: string;
}

export interface AssignmentAttemptReport {
  id: string;
  nickname: string;
  score: number;
  correctCount: number;
  finished: boolean;
  startedAt: string;
  finishedAt: string | null;
  answers: GameReportPlayer["answers"];
}

export interface AssignmentReport extends AssignmentSummary {
  questions: Question[];
  attempts: AssignmentAttemptReport[];
}

/** What a student sees when opening an assignment link. */
export interface AssignmentInfo {
  code: string;
  title: string;
  questionCount: number;
  deadline: string | null;
  open: boolean;
  ownerName: string;
}

export interface SoloQuestionPayload {
  index: number;
  total: number;
  question: PublicQuestionWithMeta;
}

export interface SoloAnswerResult {
  correct: boolean | null;
  points: number;
  score: number;
  streak: number;
  solution: Question | null;
  finished: boolean;
  correctCount: number;
}
