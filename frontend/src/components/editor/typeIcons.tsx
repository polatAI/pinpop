import {
  ArrowDownUp,
  BarChart3,
  Cloud,
  ListChecks,
  ListTodo,
  type LucideIcon,
  SlidersHorizontal,
  ToggleRight,
  Type,
} from "lucide-react";
import type { QuestionType } from "@/shared";

export const TYPE_ICONS: Record<QuestionType, LucideIcon> = {
  quiz: ListTodo,
  multi: ListChecks,
  truefalse: ToggleRight,
  type: Type,
  slider: SlidersHorizontal,
  order: ArrowDownUp,
  poll: BarChart3,
  wordcloud: Cloud,
};

export const TYPE_COLORS: Record<QuestionType, string> = {
  quiz: "bg-ans-a",
  multi: "bg-ans-e",
  truefalse: "bg-ans-d",
  type: "bg-ans-b",
  slider: "bg-ans-c",
  order: "bg-tang-500",
  poll: "bg-ans-f",
  wordcloud: "bg-ink-700",
};

export function TypeIcon({ type, className }: { type: QuestionType; className?: string }) {
  const Icon = TYPE_ICONS[type];
  return <Icon className={className} aria-hidden />;
}
