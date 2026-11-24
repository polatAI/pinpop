import { Rocket } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { Button, Dialog, Field, Select, Switch } from "@/components/ui";
import { useErrorMessage } from "@/hooks/useErrorMessage";
import { api } from "@/lib/api";
import { storage } from "@/lib/utils";
import type { CreatedGame, GameSettingsInput } from "@/shared";

type Settings = Required<Omit<GameSettingsInput, "readSeconds">> & { readSeconds: number };

const DEFAULTS: Settings = {
  shuffleQuestions: false,
  shuffleAnswers: false,
  showQuestionOnDevices: true,
  autoAdvance: false,
  allowLateJoin: true,
  randomNicknames: false,
  readSeconds: 4,
};

const STORAGE_KEY = "pinpop:game-settings";
const TOGGLES = [
  "shuffleQuestions",
  "shuffleAnswers",
  "showQuestionOnDevices",
  "autoAdvance",
  "allowLateJoin",
  "randomNicknames",
] as const;

/** Lets the host tweak game options and opens a live lobby for the quiz. */
export function StartGameDialog({
  quizId,
  open,
  onClose,
}: {
  quizId: string | null;
  open: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation("game");
  const navigate = useNavigate();
  const errorMessage = useErrorMessage();
  const [settings, setSettings] = useState<Settings>(() => ({
    ...DEFAULTS,
    ...(storage.getJSON<Partial<Settings>>(STORAGE_KEY) ?? {}),
  }));
  const [loading, setLoading] = useState(false);

  const update = (patch: Partial<Settings>) =>
    setSettings((s) => {
      const next = { ...s, ...patch };
      storage.setJSON(STORAGE_KEY, next);
      return next;
    });

  const start = async () => {
    if (!quizId) return;
    setLoading(true);
    try {
      const game = await api.post<CreatedGame>("/api/games", { quizId, settings });
      storage.set(`pinpop:host:${game.pin}`, game.hostToken);
      onClose();
      navigate(`/host/${game.pin}#${game.hostToken}`);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t("start.title")}
      description={t("start.description")}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t("common:actions.cancel")}
          </Button>
          <Button onClick={start} loading={loading} disabled={!quizId}>
            <Rocket className="size-4" /> {t("start.open")}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        {TOGGLES.map((key) => (
          <Switch
            key={key}
            checked={settings[key]}
            onChange={(v) => update({ [key]: v })}
            label={t(`settings.${key}`)}
            description={t(`settings.${key}Hint`)}
          />
        ))}
        <Field
          label={t("settings.readSeconds")}
          hint={t("settings.readSecondsHint")}
          htmlFor="read-seconds"
          className="pt-2"
        >
          <Select
            id="read-seconds"
            value={settings.readSeconds}
            onChange={(e) => update({ readSeconds: Number(e.target.value) })}
          >
            {[0, 3, 4, 5, 7].map((s) => (
              <option key={s} value={s}>
                {s === 0 ? t("settings.readNone") : t("common:seconds", { count: s })}
              </option>
            ))}
          </Select>
        </Field>
      </div>
    </Dialog>
  );
}
