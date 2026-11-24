import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { ANSWER_STYLES } from "@/components/game/answerStyles";
import { Button } from "@/components/ui";
import { cn } from "@/lib/utils";

export default function NotFound() {
  const { t } = useTranslation("pages");
  const tiles = [ANSWER_STYLES[0], ANSWER_STYLES[1], ANSWER_STYLES[2]];
  return (
    <div className="mx-auto flex min-h-[65dvh] max-w-xl flex-col items-center justify-center px-4 py-16 text-center">
      <div className="mb-8 flex gap-3" aria-hidden>
        {["4", "0", "4"].map((ch, i) => {
          const s = tiles[i];
          return (
            <div
              key={`${ch}-${s?.letter}`}
              className={cn(
                "grid size-20 place-items-center rounded-3xl border-2 border-ink-900 font-display text-5xl font-extrabold text-white shadow-pop sm:size-24",
                s?.bg,
              )}
              style={{ animation: `float ${4 + i}s ease-in-out ${i * 0.3}s infinite` }}
            >
              {ch}
            </div>
          );
        })}
      </div>
      <h1 className="text-4xl font-extrabold">{t("notFound.title")}</h1>
      <p className="mt-3 text-lg text-muted">{t("notFound.text")}</p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link to="/">
          <Button variant="dark">{t("notFound.home")}</Button>
        </Link>
        <Link to="/join">
          <Button variant="sun">{t("common:nav.join")}</Button>
        </Link>
      </div>
    </div>
  );
}
