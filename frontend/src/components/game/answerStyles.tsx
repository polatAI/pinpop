import { Droplet, Flame, Leaf, Moon, Star, Sun } from "lucide-react";
import type { ComponentType } from "react";

export interface AnswerStyle {
  letter: string;
  /** Tailwind background class for the tile. */
  bg: string;
  /** Raw colour, for charts and inline styles. */
  color: string;
  Icon: ComponentType<{ className?: string }>;
}

/**
 * The six Pinpop answer styles. Each answer has a colour, a letter and an icon so it can be
 * told apart without relying on colour alone (colour-blind friendly).
 */
export const ANSWER_STYLES: AnswerStyle[] = [
  { letter: "A", bg: "bg-ans-a", color: "#ff5a4e", Icon: Flame },
  { letter: "B", bg: "bg-ans-b", color: "#1f9bff", Icon: Droplet },
  { letter: "C", bg: "bg-ans-c", color: "#ffb81c", Icon: Sun },
  { letter: "D", bg: "bg-ans-d", color: "#12b886", Icon: Leaf },
  { letter: "E", bg: "bg-ans-e", color: "#b14dff", Icon: Moon },
  { letter: "F", bg: "bg-ans-f", color: "#ff7ac6", Icon: Star },
];

export const answerStyle = (index: number): AnswerStyle => ANSWER_STYLES[index % ANSWER_STYLES.length] as AnswerStyle;

/** Styles for true/false questions. */
export const TRUE_STYLE: AnswerStyle = ANSWER_STYLES[3] as AnswerStyle;
export const FALSE_STYLE: AnswerStyle = ANSWER_STYLES[0] as AnswerStyle;
