import { ImagePlus, Link2, Loader2, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button, Input } from "@/components/ui";
import { useErrorMessage } from "@/hooks/useErrorMessage";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

export function ImageField({
  value,
  onChange,
  className,
  compact,
}: {
  value: string | null | undefined;
  onChange: (url: string | null) => void;
  className?: string;
  compact?: boolean;
}) {
  const { t } = useTranslation("editor");
  const errorMessage = useErrorMessage();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [linkMode, setLinkMode] = useState(false);
  const [link, setLink] = useState("");
  const [dragging, setDragging] = useState(false);

  async function upload(file: File) {
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await api.upload<{ url: string }>("/api/uploads", form);
      onChange(res.url);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setUploading(false);
    }
  }

  function applyLink() {
    const url = link.trim();
    if (!/^https:\/\//.test(url)) {
      toast.error(t("image.invalidUrl"));
      return;
    }
    onChange(url);
    setLink("");
    setLinkMode(false);
  }

  if (value) {
    return (
      <div className={cn("group relative overflow-hidden rounded-2xl border-2 border-border bg-surface-2", className)}>
        <img src={value} alt="" className={cn("mx-auto w-full object-contain", compact ? "max-h-40" : "max-h-72")} />
        <div className="absolute top-2 right-2 flex gap-2">
          <Button size="sm" variant="secondary" onClick={() => fileRef.current?.click()} loading={uploading}>
            <ImagePlus className="size-4" /> {t("image.replace")}
          </Button>
          <Button size="sm" variant="danger" onClick={() => onChange(null)} aria-label={t("image.remove")}>
            <Trash2 className="size-4" />
          </Button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp,image/avif"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void upload(f);
            e.target.value = "";
          }}
        />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-border px-4 text-center transition-colors",
        compact ? "py-4" : "py-7",
        dragging && "border-pop-500 bg-pop-50 dark:bg-pop-900/20",
        className,
      )}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        const f = e.dataTransfer.files?.[0];
        if (f) void upload(f);
      }}
    >
      {uploading ? (
        <Loader2 className="size-6 animate-spin text-muted" />
      ) : linkMode ? (
        <div className="flex w-full max-w-md gap-2">
          <Input
            autoFocus
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder="https://…"
            aria-label={t("image.url")}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                applyLink();
              }
              if (e.key === "Escape") setLinkMode(false);
            }}
          />
          <Button size="md" onClick={applyLink}>
            {t("common:actions.add")}
          </Button>
        </div>
      ) : (
        <>
          <p className="text-sm text-muted">{t("image.hint")}</p>
          <div className="flex flex-wrap justify-center gap-2">
            <Button size="sm" variant="secondary" onClick={() => fileRef.current?.click()}>
              <ImagePlus className="size-4" /> {t("image.upload")}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setLinkMode(true)}>
              <Link2 className="size-4" /> {t("image.fromUrl")}
            </Button>
          </div>
        </>
      )}
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp,image/avif"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void upload(f);
          e.target.value = "";
        }}
      />
    </div>
  );
}
