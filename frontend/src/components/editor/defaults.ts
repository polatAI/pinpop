import { type Question, type QuestionType, questionSchema, shortId } from "@/shared";

export type Draft<T extends QuestionType = QuestionType> = Extract<Question, { type: T }>;

const base = (prev?: Question) => ({
  id: prev?.id ?? shortId(),
  text: prev?.text ?? "",
  image: prev?.image ?? null,
  timeLimit: prev?.timeLimit ?? 20,
  points: prev?.points ?? ("standard" as const),
  explanation: prev?.explanation ?? null,
});

const choice = (text = "", correct = false) => ({ id: shortId(6), text, correct });

/** Texts of the answer options of a question, used when switching type. */
function optionTexts(q?: Question): string[] {
  if (!q) return [];
  switch (q.type) {
    case "quiz":
    case "multi":
    case "poll":
      return q.choices.map((c) => c.text);
    case "order":
      return q.items.map((i) => i.text);
    case "type":
      return q.acceptedAnswers;
    default:
      return [];
  }
}

/** Creates a new question of the given type, carrying over as much as possible from `prev`. */
export function makeQuestion(type: QuestionType, prev?: Question): Question {
  const b = base(prev);
  const texts = optionTexts(prev);
  const correctTexts = new Set(
    prev && (prev.type === "quiz" || prev.type === "multi")
      ? prev.choices.filter((c) => c.correct).map((c) => c.text)
      : [],
  );
  const choicesFrom = (min: number, withCorrect: boolean) => {
    const list = texts.slice(0, 6).map((t) => choice(t, withCorrect && correctTexts.has(t)));
    while (list.length < min) list.push(choice());
    return list;
  };

  switch (type) {
    case "quiz": {
      const choices = choicesFrom(4, true);
      let seen = false;
      for (const c of choices) {
        if (c.correct && !seen) seen = true;
        else c.correct = false;
      }
      if (!seen && choices[0]) choices[0].correct = true;
      return { ...b, type, points: b.points, choices };
    }
    case "multi": {
      const choices = choicesFrom(4, true);
      if (!choices.some((c) => c.correct) && choices[0]) choices[0].correct = true;
      return { ...b, type, choices };
    }
    case "poll":
      return {
        ...b,
        type,
        points: "none",
        choices: choicesFrom(2, false).map(({ id, text }) => ({ id, text })),
      };
    case "truefalse":
      return { ...b, type, correct: prev?.type === "truefalse" ? prev.correct : true };
    case "type": {
      const accepted =
        prev && (prev.type === "quiz" || prev.type === "multi")
          ? prev.choices
              .filter((c) => c.correct)
              .map((c) => c.text)
              .filter(Boolean)
          : texts.filter(Boolean);
      return { ...b, type, acceptedAnswers: accepted.slice(0, 10) };
    }
    case "slider":
      return { ...b, type, min: 0, max: 100, step: 1, correct: 50, tolerance: 0, unit: null };
    case "order": {
      const items = texts.slice(0, 6).map((text) => ({ id: shortId(6), text }));
      while (items.length < 3) items.push({ id: shortId(6), text: "" });
      return { ...b, type, items };
    }
    case "wordcloud":
      return { ...b, type, points: "none", maxLength: 20 };
  }
}

export function duplicateQuestion(q: Question): Question {
  const copy = structuredClone(q) as Question;
  copy.id = shortId();
  if ("choices" in copy) copy.choices = copy.choices.map((c) => ({ ...c, id: shortId(6) })) as never;
  if ("items" in copy) copy.items = copy.items.map((i) => ({ ...i, id: shortId(6) }));
  return copy;
}

export interface QuestionIssue {
  path: string;
  message: string;
}

export function validateQuestion(q: Question): QuestionIssue[] {
  const res = questionSchema.safeParse(q);
  if (res.success) return [];
  return res.error.issues.map((i) => ({ path: i.path.join("."), message: i.message }));
}

export function newChoice(text = "", correct = false) {
  return choice(text, correct);
}

export const LANGUAGE_OPTIONS = [
  { code: "en", label: "English" },
  { code: "tr", label: "Türkçe" },
  { code: "de", label: "Deutsch" },
  { code: "es", label: "Español" },
  { code: "fr", label: "Français" },
  { code: "it", label: "Italiano" },
  { code: "pt", label: "Português" },
  { code: "nl", label: "Nederlands" },
  { code: "pl", label: "Polski" },
  { code: "ru", label: "Русский" },
  { code: "uk", label: "Українська" },
  { code: "ar", label: "العربية" },
  { code: "fa", label: "فارسی" },
  { code: "hi", label: "हिन्दी" },
  { code: "ja", label: "日本語" },
  { code: "ko", label: "한국어" },
  { code: "zh", label: "中文" },
  { code: "az", label: "Azərbaycanca" },
] as const;
