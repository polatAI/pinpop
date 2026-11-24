import { Plus } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui";
import { cn } from "@/lib/utils";
import { QUESTION_TYPES, type QuestionType } from "@/shared";
import { TYPE_COLORS, TypeIcon } from "./typeIcons";

export function QuestionTypeGrid({
  onPick,
  current,
  className,
}: {
  onPick: (type: QuestionType) => void;
  current?: QuestionType;
  className?: string;
}) {
  const { t } = useTranslation("editor");
  return (
    <div className={cn("grid grid-cols-1 gap-1.5 sm:grid-cols-2", className)}>
      {QUESTION_TYPES.map((type) => (
        <button
          key={type}
          type="button"
          onClick={() => onPick(type)}
          className={cn(
            "flex items-center gap-3 rounded-2xl border-2 p-2.5 text-left transition-colors",
            current === type ? "border-pop-500 bg-pop-50 dark:bg-pop-900/25" : "border-transparent hover:bg-surface-2",
          )}
        >
          <span
            className={cn(
              "grid size-9 shrink-0 place-items-center rounded-xl border-2 border-ink-900 text-white dark:border-black",
              TYPE_COLORS[type],
            )}
          >
            <TypeIcon type={type} className="size-4" />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-bold">{t(`common:questionTypes.${type}`)}</span>
            <span className="block text-xs text-muted">{t(`common:questionTypeHints.${type}`)}</span>
          </span>
        </button>
      ))}
    </div>
  );
}

/** "Add question" button with a popover listing all question types. */
export function AddQuestionMenu({
  onAdd,
  className,
  size = "md",
  placement = "top",
}: {
  onAdd: (type: QuestionType) => void;
  className?: string;
  size?: "sm" | "md" | "lg";
  placement?: "top" | "bottom";
}) {
  const { t } = useTranslation("editor");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className={cn("relative", className)}>
      <Button
        size={size}
        className="w-full"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <Plus className="size-5" /> {t("list.addQuestion")}
      </Button>
      <AnimatePresence>
        {open ? (
          <motion.div
            role="menu"
            initial={{ opacity: 0, y: placement === "top" ? 8 : -8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: placement === "top" ? 8 : -8, scale: 0.97 }}
            transition={{ duration: 0.15 }}
            className={cn(
              "absolute left-0 z-40 w-[min(34rem,calc(100vw-2rem))] rounded-3xl border-2 border-ink-900 bg-surface p-2 shadow-pop dark:border-ink-600",
              placement === "top" ? "bottom-full mb-2" : "top-full mt-2",
            )}
          >
            <QuestionTypeGrid
              onPick={(type) => {
                setOpen(false);
                onAdd(type);
              }}
            />
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
