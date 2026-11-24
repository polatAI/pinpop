import { X } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

/** Free-text chips (tags, accepted answers). Enter or comma adds a chip. */
export function ChipsInput({
  value,
  onChange,
  max,
  maxLength,
  placeholder,
  label,
  lowercase,
  id,
}: {
  value: string[];
  onChange: (v: string[]) => void;
  max: number;
  maxLength: number;
  placeholder?: string;
  label: string;
  lowercase?: boolean;
  id?: string;
}) {
  const [draft, setDraft] = useState("");
  const full = value.length >= max;

  function commit(raw: string) {
    let v = raw.trim().slice(0, maxLength);
    if (lowercase) v = v.toLowerCase();
    if (!v || full) return;
    if (value.some((x) => x.toLowerCase() === v.toLowerCase())) {
      setDraft("");
      return;
    }
    onChange([...value, v]);
    setDraft("");
  }

  return (
    <div
      className={cn(
        "flex min-h-11 flex-wrap items-center gap-1.5 rounded-2xl border-2 border-border bg-surface px-2 py-1.5 focus-within:border-pop-500",
      )}
    >
      {value.map((chip, i) => (
        <span
          key={`${chip}-${i}`}
          className="inline-flex items-center gap-1 rounded-xl bg-surface-2 py-1 pr-1 pl-2.5 text-sm font-semibold"
        >
          {chip}
          <button
            type="button"
            className="rounded-lg p-0.5 text-muted hover:bg-border hover:text-fg"
            onClick={() => onChange(value.filter((_, j) => j !== i))}
            aria-label={`${chip} ×`}
          >
            <X className="size-3.5" />
          </button>
        </span>
      ))}
      {!full ? (
        <input
          id={id}
          value={draft}
          aria-label={label}
          placeholder={value.length === 0 ? placeholder : undefined}
          maxLength={maxLength}
          onChange={(e) => {
            const v = e.target.value;
            if (v.endsWith(",")) commit(v.slice(0, -1));
            else setDraft(v);
          }}
          onBlur={() => commit(draft)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit(draft);
            } else if (e.key === "Backspace" && !draft && value.length > 0) {
              onChange(value.slice(0, -1));
            }
          }}
          className="min-w-28 flex-1 bg-transparent px-1.5 py-1 text-fg placeholder:text-muted/70 focus:outline-none"
        />
      ) : null}
    </div>
  );
}
