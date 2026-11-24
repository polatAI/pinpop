import { z } from "zod";

export const QUESTION_TYPES = ["quiz", "multi", "truefalse", "type", "slider", "order", "poll", "wordcloud"] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

/** Question types that award points. Polls and word clouds are opinion-only. */
export const SCORED_TYPES: ReadonlySet<QuestionType> = new Set([
  "quiz",
  "multi",
  "truefalse",
  "type",
  "slider",
  "order",
]);

export const POINTS_MODES = ["none", "standard", "double"] as const;
export type PointsMode = (typeof POINTS_MODES)[number];

export const TIME_LIMITS = [5, 10, 15, 20, 30, 45, 60, 90, 120, 180, 240] as const;

const id = z.string().min(1).max(64);
const mediaUrl = z
  .string()
  .max(2048)
  .refine((v) => v.startsWith("/uploads/") || /^https?:\/\//.test(v), "Invalid media URL");

const baseQuestion = {
  id,
  text: z.string().trim().min(1).max(500),
  image: mediaUrl.nullish(),
  timeLimit: z.number().int().min(5).max(240).default(20),
  points: z.enum(POINTS_MODES).default("standard"),
  explanation: z.string().max(1000).nullish(),
};

export const choiceSchema = z.object({
  id,
  text: z.string().trim().min(1).max(120),
  correct: z.boolean().default(false),
});
export type Choice = z.infer<typeof choiceSchema>;

export const orderItemSchema = z.object({
  id,
  text: z.string().trim().min(1).max(120),
});

const atLeastOneCorrect = (choices: Choice[]) => choices.some((c) => c.correct);

export const quizQuestionSchema = z.object({
  ...baseQuestion,
  type: z.literal("quiz"),
  choices: z.array(choiceSchema).min(2).max(6).refine(atLeastOneCorrect, "At least one choice must be correct"),
});

export const multiQuestionSchema = z.object({
  ...baseQuestion,
  type: z.literal("multi"),
  choices: z.array(choiceSchema).min(2).max(6).refine(atLeastOneCorrect, "At least one choice must be correct"),
});

export const trueFalseQuestionSchema = z.object({
  ...baseQuestion,
  type: z.literal("truefalse"),
  correct: z.boolean(),
});

export const typeQuestionSchema = z.object({
  ...baseQuestion,
  type: z.literal("type"),
  acceptedAnswers: z.array(z.string().trim().min(1).max(80)).min(1).max(10),
});

export const sliderQuestionSchema = z
  .object({
    ...baseQuestion,
    type: z.literal("slider"),
    min: z.number(),
    max: z.number(),
    step: z.number().positive().default(1),
    correct: z.number(),
    /** Answers within ±tolerance earn full points; points fade out linearly beyond it. */
    tolerance: z.number().min(0).default(0),
    unit: z.string().max(16).nullish(),
  })
  .refine((q) => q.max > q.min, "max must be greater than min")
  .refine((q) => q.correct >= q.min && q.correct <= q.max, "correct must be within range");

export const orderQuestionSchema = z.object({
  ...baseQuestion,
  type: z.literal("order"),
  /** Items in the correct order. They are shuffled before being shown to players. */
  items: z.array(orderItemSchema).min(2).max(6),
});

export const pollQuestionSchema = z.object({
  ...baseQuestion,
  type: z.literal("poll"),
  choices: z
    .array(choiceSchema.omit({ correct: true }))
    .min(2)
    .max(6),
});

export const wordCloudQuestionSchema = z.object({
  ...baseQuestion,
  type: z.literal("wordcloud"),
  maxLength: z.number().int().min(1).max(40).default(20),
});

export const questionSchema = z.discriminatedUnion("type", [
  quizQuestionSchema,
  multiQuestionSchema,
  trueFalseQuestionSchema,
  typeQuestionSchema,
  sliderQuestionSchema,
  orderQuestionSchema,
  pollQuestionSchema,
  wordCloudQuestionSchema,
]);
export type Question = z.infer<typeof questionSchema>;
export type QuestionInput = z.input<typeof questionSchema>;
export type QuestionOf<T extends QuestionType> = Extract<Question, { type: T }>;

export const VISIBILITIES = ["private", "unlisted", "public"] as const;
export type Visibility = (typeof VISIBILITIES)[number];

export const quizInputSchema = z.object({
  title: z.string().trim().min(1).max(120),
  description: z.string().max(1000).default(""),
  language: z.string().min(2).max(10).default("en"),
  visibility: z.enum(VISIBILITIES).default("private"),
  tags: z.array(z.string().trim().toLowerCase().min(1).max(30)).max(10).default([]),
  coverImage: mediaUrl.nullish(),
  questions: z.array(questionSchema).max(100).default([]),
});
export type QuizInput = z.input<typeof quizInputSchema>;
export type QuizData = z.infer<typeof quizInputSchema>;

export interface QuizSummary {
  id: string;
  title: string;
  description: string;
  language: string;
  visibility: Visibility;
  tags: string[];
  coverImage: string | null;
  questionCount: number;
  playCount: number;
  ownerId: string;
  ownerName: string | null;
  forkedFrom: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Quiz extends QuizSummary {
  questions: Question[];
}

/** Portable file format used for import/export and sharing quizzes between instances. */
export const quizFileSchema = z.object({
  pinpop: z.literal(1),
  quiz: quizInputSchema,
});
export type QuizFile = z.infer<typeof quizFileSchema>;
