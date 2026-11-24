import { ChevronDown, Sparkles } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { toast } from "sonner";
import { useAiStatus } from "@/components/ai/useAiStatus";
import { Button } from "@/components/ui";
import { useErrorMessage } from "@/hooks/useErrorMessage";
import { api } from "@/lib/api";
import { AI_IMPROVE_ACTIONS, type Question } from "@/shared";

const ACTIONS = AI_IMPROVE_ACTIONS.filter((a) => a !== "translate");

/** Lets the model rewrite one question (harder, easier, better distractors …). */
export function AiImproveMenu({
  question,
  onImproved,
  disabled,
}: {
  question: Question;
  onImproved: (q: Question) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation("editor");
  const errorMessage = useErrorMessage();
  const status = useAiStatus();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
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

  const enabled = status.data?.enabled ?? false;
  const choicesOnly = question.type === "quiz" || question.type === "multi";

  async function run(action: (typeof ACTIONS)[number]) {
    setOpen(false);
    setBusy(action);
    try {
      const res = await api.post<{ question: Question }>("/api/ai/improve", { action, question });
      onImproved({ ...res.question, id: question.id });
      toast.success(t("ai.improved"));
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div ref={ref} className="relative">
      <Button
        size="sm"
        variant="secondary"
        onClick={() => setOpen((v) => !v)}
        loading={busy !== null}
        disabled={disabled || status.isLoading}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {busy === null ? <Sparkles className="size-4 text-pop-500" /> : null}
        {busy ? t("ai.working") : t("ai.improve")}
        <ChevronDown className="size-4" />
      </Button>
      <AnimatePresence>
        {open ? (
          <motion.div
            role="menu"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.12 }}
            className="absolute right-0 z-40 mt-2 w-64 rounded-2xl border-2 border-ink-900 bg-surface p-1.5 shadow-pop dark:border-ink-600"
          >
            {enabled ? (
              ACTIONS.filter((a) => a !== "distractors" || choicesOnly).map((action) => (
                <button
                  key={action}
                  type="button"
                  role="menuitem"
                  disabled={!question.text.trim()}
                  onClick={() => void run(action)}
                  className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-semibold hover:bg-surface-2 disabled:opacity-40"
                >
                  {t(`ai.actions.${action}`)}
                </button>
              ))
            ) : (
              <div className="space-y-2 p-2 text-sm">
                <p className="text-muted">{t("ai.disabledHint")}</p>
                <Link to="/settings#ai" className="font-semibold text-pop-600 hover:underline dark:text-pop-300">
                  {t("ai.openSettings")}
                </Link>
              </div>
            )}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
