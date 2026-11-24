import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { ApiError } from "@/lib/api";
import { GameRequestError } from "@/lib/socket";

/** Turns API / socket errors into a translated, human-friendly message. */
export function useErrorMessage() {
  const { t, i18n } = useTranslation("common");
  return useCallback(
    (err: unknown): string => {
      const code =
        err instanceof ApiError || err instanceof GameRequestError
          ? err.code
          : err instanceof TypeError
            ? "network"
            : "generic";
      const key = `errors.${code}`;
      if (i18n.exists(key, { ns: "common" })) return t(key);
      if (err instanceof ApiError && err.message && err.message !== err.code) return err.message;
      return t("errors.generic");
    },
    [t, i18n],
  );
}
