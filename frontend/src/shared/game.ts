import { z } from "zod";
import type { Question } from "./quiz";
import type { Answer } from "./scoring";

export const gameSettingsSchema = z.object({
  shuffleQuestions: z.boolean().default(false),
  shuffleAnswers: z.boolean().default(false),
  /** Show question text and answer labels on player devices (not only on the big screen). */
  showQuestionOnDevices: z.boolean().default(true),
  /** Automatically move on after the reveal / leaderboard without host input. */
  autoAdvance: z.boolean().default(false),
  /** Allow players to join after the game started. */
  allowLateJoin: z.boolean().default(true),
  /** Seconds the question is shown before answers open. */
  readSeconds: z.number().int().min(0).max(10).default(4),
  /** Generate fun random nicknames instead of letting players choose. */
  randomNicknames: z.boolean().default(false),
});
export type GameSettings = z.infer<typeof gameSettingsSchema>;
export type GameSettingsInput = z.input<typeof gameSettingsSchema>;

export const GAME_PHASES = ["lobby", "intro", "question", "reveal", "leaderboard", "podium"] as const;
export type GamePhase = (typeof GAME_PHASES)[number];

/** Question as shown to players: no solution data. */
export type PublicQuestion =
  | { type: "quiz" | "multi" | "poll"; choices: { id: string; text: string }[] }
  | { type: "truefalse" }
  | { type: "type"; maxLength: number }
  | { type: "slider"; min: number; max: number; step: number; unit: string | null }
  | { type: "order"; items: { id: string; text: string }[] }
  | { type: "wordcloud"; maxLength: number };

export type PublicQuestionWithMeta = PublicQuestion & {
  id: string;
  text: string;
  image: string | null;
  timeLimit: number;
  points: Question["points"];
};

export interface RevealStats {
  answeredCount: number;
  correctCount: number;
  /** Per choice id for quiz/multi/poll, "true"/"false" for truefalse. */
  counts?: Record<string, number>;
  /** Normalized answers with counts for type/wordcloud. */
  words?: { text: string; count: number }[];
  /** Submitted values for slider. */
  values?: number[];
}

export interface LeaderboardEntry {
  playerId: string;
  nickname: string;
  avatar: string;
  score: number;
  rank: number;
  previousRank: number | null;
  lastPoints: number;
  streak: number;
}

export interface LobbyPlayer {
  id: string;
  nickname: string;
  avatar: string;
  connected: boolean;
}

export interface HostView {
  role: "host";
  pin: string;
  phase: GamePhase;
  quizTitle: string;
  settings: GameSettings;
  locked: boolean;
  players: LobbyPlayer[];
  questionIndex: number;
  totalQuestions: number;
  /** Present from intro onwards. */
  question: PublicQuestionWithMeta | null;
  /** Full question with solution, only during reveal and later. */
  solution: Question | null;
  /** Epoch ms when answers open (intro) or close (question). */
  deadline: number | null;
  answeredCount: number;
  stats: RevealStats | null;
  leaderboard: LeaderboardEntry[];
  serverNow: number;
  paused: boolean;
}

export interface PlayerResult {
  correct: boolean | null;
  points: number;
  streak: number;
  /** Rank after this question. */
  rank: number;
}

export interface PlayerView {
  role: "player";
  pin: string;
  phase: GamePhase;
  quizTitle: string;
  me: {
    id: string;
    nickname: string;
    avatar: string;
    score: number;
    rank: number | null;
    streak: number;
  };
  playerCount: number;
  questionIndex: number;
  totalQuestions: number;
  question: PublicQuestionWithMeta | null;
  showQuestionOnDevices: boolean;
  deadline: number | null;
  answered: boolean;
  myAnswer: Answer | null;
  result: PlayerResult | null;
  solution: Question | null;
  /** Top entries of the leaderboard (leaderboard and podium phases). */
  leaderboard: LeaderboardEntry[];
  serverNow: number;
  paused: boolean;
}

export type Ack<T = void> = (res: { ok: true; data: T } | { ok: false; error: string }) => void;

export interface ClientToServerEvents {
  "host:attach": (payload: { pin: string; hostToken: string }, ack: Ack) => void;
  "host:start": (ack: Ack) => void;
  "host:next": (ack: Ack) => void;
  "host:skip": (ack: Ack) => void;
  "host:pause": (paused: boolean, ack: Ack) => void;
  "host:lock": (locked: boolean, ack: Ack) => void;
  "host:kick": (playerId: string, ack: Ack) => void;
  "host:end": (ack: Ack) => void;
  "player:join": (
    payload: { pin: string; nickname: string; avatar?: string; playerToken?: string },
    ack: Ack<{ playerId: string; playerToken: string }>,
  ) => void;
  "player:answer": (payload: { questionIndex: number; answer: Answer }, ack: Ack) => void;
  "player:leave": () => void;
}

export interface ServerToClientEvents {
  "host:view": (view: HostView) => void;
  "player:view": (view: PlayerView) => void;
  "player:kicked": () => void;
  "game:ended": (payload: { reason: "host-ended" | "expired" | "finished" }) => void;
}

/** Game-level error codes returned through acks; clients translate them. */
export const GAME_ERRORS = {
  notFound: "game_not_found",
  locked: "game_locked",
  full: "game_full",
  started: "game_started",
  nicknameTaken: "nickname_taken",
  nicknameInvalid: "nickname_invalid",
  nicknameInappropriate: "nickname_inappropriate",
  notAllowed: "not_allowed",
  invalidAnswer: "invalid_answer",
  tooLate: "too_late",
  alreadyAnswered: "already_answered",
  rateLimited: "rate_limited",
  badRequest: "bad_request",
} as const;

export const PIN_LENGTH = 6;

export const AVATARS = [
  "🦊",
  "🐼",
  "🐸",
  "🦄",
  "🐙",
  "🦁",
  "🐯",
  "🐨",
  "🐵",
  "🐧",
  "🦉",
  "🐢",
  "🦖",
  "🐳",
  "🦋",
  "🐝",
  "🦩",
  "🦔",
  "🐲",
  "👾",
  "🤖",
  "👻",
  "🍕",
  "🌮",
  "🍩",
  "🌵",
  "🚀",
  "⚡",
  "🌈",
  "🎸",
] as const;
