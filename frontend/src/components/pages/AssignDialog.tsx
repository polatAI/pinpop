import { useQueryClient } from "@tanstack/react-query";
import { QRCodeSVG } from "qrcode.react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { Button, Dialog, Field, Input, Switch } from "@/components/ui";
import { useErrorMessage } from "@/hooks/useErrorMessage";
import { api } from "@/lib/api";
import type { AssignmentSummary, CreateAssignmentInput } from "@/shared";
import { CopyBox } from "./common";

/** Creates a self-paced homework link for a quiz. */
export function AssignDialog({ quiz, onClose }: { quiz: { id: string; title: string } | null; onClose: () => void }) {
  const { t } = useTranslation("pages");
  const errorMessage = useErrorMessage();
  const client = useQueryClient();
  const [title, setTitle] = useState("");
  const [deadline, setDeadline] = useState("");
  const [shuffleQuestions, setShuffleQuestions] = useState(false);
  const [shuffleAnswers, setShuffleAnswers] = useState(true);
  const [showAnswers, setShowAnswers] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<AssignmentSummary | null>(null);

  useEffect(() => {
    if (quiz) {
      setTitle(quiz.title);
      setDeadline("");
      setCreated(null);
      setError(null);
    }
  }, [quiz]);

  const create = async () => {
    if (!quiz) return;
    setBusy(true);
    setError(null);
    try {
      const body: CreateAssignmentInput = {
        quizId: quiz.id,
        title: title.trim() || undefined,
        deadline: deadline ? new Date(deadline).toISOString() : null,
        shuffleQuestions,
        shuffleAnswers,
        showAnswers,
      };
      setCreated(await api.post<AssignmentSummary>("/api/assignments", body));
      await client.invalidateQueries({ queryKey: ["assignments"] });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={quiz !== null}
      onClose={onClose}
      title={created ? t("assign.readyTitle") : t("assign.title")}
      description={created ? t("assign.readyText") : t("assign.subtitle")}
      footer={
        created ? (
          <>
            <Link to={`/assignments/${created.id}`} onClick={onClose}>
              <Button variant="secondary">{t("assign.viewResults")}</Button>
            </Link>
            <Button onClick={onClose}>{t("common:actions.close")}</Button>
          </>
        ) : (
          <>
            <Button variant="ghost" onClick={onClose}>
              {t("common:actions.cancel")}
            </Button>
            <Button onClick={create} loading={busy}>
              {t("assign.create")}
            </Button>
          </>
        )
      }
    >
      {created ? (
        <div className="flex flex-col items-center gap-5">
          <div className="rounded-3xl border-2 border-ink-900 bg-white p-4 shadow-pop dark:border-ink-600">
            <QRCodeSVG value={created.url} size={180} level="M" />
          </div>
          <div className="w-full">
            <CopyBox value={created.url} label={t("assign.link")} />
          </div>
          <p className="text-center text-sm text-muted">{t("assign.code", { code: created.code })}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <Field label={t("assign.name")} htmlFor="assign-title">
            <Input id="assign-title" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} />
          </Field>
          <Field label={t("assign.deadline")} hint={t("assign.deadlineHint")} htmlFor="assign-deadline">
            <Input
              id="assign-deadline"
              type="datetime-local"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
            />
          </Field>
          <Switch checked={shuffleQuestions} onChange={setShuffleQuestions} label={t("assign.shuffleQuestions")} />
          <Switch checked={shuffleAnswers} onChange={setShuffleAnswers} label={t("assign.shuffleAnswers")} />
          <Switch
            checked={showAnswers}
            onChange={setShowAnswers}
            label={t("assign.showAnswers")}
            description={t("assign.showAnswersHint")}
          />
          {error ? <p className="text-sm font-medium text-[#e5383b]">{error}</p> : null}
        </div>
      )}
    </Dialog>
  );
}
