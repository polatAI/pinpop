import { Download, FileJson, FileSpreadsheet, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { Button, Dialog, Field, Input } from "@/components/ui";
import { useErrorMessage } from "@/hooks/useErrorMessage";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { Quiz } from "@/shared";

const CSV_TEMPLATE = [
  "type,question,answer1,answer2,answer3,answer4,answer5,answer6,correct,time,explanation",
  'quiz,What is the capital of Japan?,Kyoto,Tokyo,Osaka,Nagoya,,,2,20,"Tokyo has been the capital since 1868."',
  "truefalse,The Sun is a star.,,,,,,,true,10,",
].join("\n");

function downloadTemplate() {
  const blob = new Blob([`﻿${CSV_TEMPLATE}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "pinpop-template.csv";
  a.click();
  URL.revokeObjectURL(url);
}

export function ImportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation("pages");
  const navigate = useNavigate();
  const errorMessage = useErrorMessage();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const format: "json" | "csv" | null = file
    ? file.name.toLowerCase().endsWith(".csv")
      ? "csv"
      : file.name.toLowerCase().endsWith(".json")
        ? "json"
        : null
    : null;

  const reset = () => {
    setFile(null);
    setTitle("");
    setError(null);
  };

  const submit = async () => {
    if (!file || !format) {
      setError(t("import.unsupported"));
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const content = await file.text();
      const quiz = await api.post<Quiz>("/api/quizzes/import", {
        format,
        content,
        ...(format === "csv" ? { title: title.trim() || file.name.replace(/\.csv$/i, "") } : {}),
      });
      reset();
      onClose();
      navigate(`/quiz/${quiz.id}/edit`);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      title={t("import.title")}
      description={t("import.description")}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t("common:actions.cancel")}
          </Button>
          <Button onClick={submit} loading={loading} disabled={!file}>
            <Upload className="size-4" /> {t("common:actions.import")}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const f = e.dataTransfer.files[0];
            if (f) setFile(f);
          }}
          className={cn(
            "flex flex-col items-center gap-2 rounded-3xl border-2 border-dashed px-6 py-10 text-center transition-colors",
            file ? "border-pop-500 bg-pop-50 dark:bg-pop-900/20" : "border-border hover:border-pop-400",
          )}
        >
          {format === "csv" ? (
            <FileSpreadsheet className="size-10 text-[#12b886]" />
          ) : format === "json" ? (
            <FileJson className="size-10 text-[#1f9bff]" />
          ) : (
            <Upload className="size-10 text-muted" />
          )}
          <span className="font-semibold">{file ? file.name : t("import.choose")}</span>
          <span className="text-sm text-muted">{t("import.formats")}</span>
        </button>
        <input
          ref={inputRef}
          type="file"
          accept=".json,.csv,application/json,text/csv"
          className="hidden"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
        {format === "csv" ? (
          <Field label={t("import.quizTitle")} htmlFor="import-title">
            <Input
              id="import-title"
              value={title}
              maxLength={120}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={file?.name.replace(/\.csv$/i, "")}
            />
          </Field>
        ) : null}
        {error ? (
          <p className="text-sm font-medium text-[#e5383b]" role="alert">
            {error}
          </p>
        ) : null}
        <div className="rounded-2xl bg-surface-2 p-4 text-sm">
          <p className="text-muted">{t("import.csvHelp")}</p>
          <button
            type="button"
            onClick={downloadTemplate}
            className="mt-2 inline-flex items-center gap-1.5 font-semibold text-pop-600 hover:underline"
          >
            <Download className="size-4" /> {t("import.template")}
          </button>
        </div>
      </div>
    </Dialog>
  );
}
