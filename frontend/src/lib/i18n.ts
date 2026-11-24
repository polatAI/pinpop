import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import enCommon from "../locales/en/common.json";
import enEditor from "../locales/en/editor.json";
import enGame from "../locales/en/game.json";
import enPages from "../locales/en/pages.json";
import trCommon from "../locales/tr/common.json";
import trEditor from "../locales/tr/editor.json";
import trGame from "../locales/tr/game.json";
import trPages from "../locales/tr/pages.json";
import { storage } from "./utils";

/**
 * Translations are split by area: `common` (shell, shared UI, errors), `game` (host & player screens),
 * `editor` (quiz editor & AI generator) and `pages` (everything else). Add a language by copying `locales/en`.
 */
export const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "tr", label: "Türkçe" },
] as const;

export const resources = {
  en: { common: enCommon, game: enGame, editor: enEditor, pages: enPages },
  tr: { common: trCommon, game: trGame, editor: trEditor, pages: trPages },
} as const;

function detectLanguage(): string {
  const saved = storage.get("pinpop:lang");
  if (saved && saved in resources) return saved;
  const nav = navigator.language?.slice(0, 2).toLowerCase();
  return nav && nav in resources ? nav : "en";
}

void i18n.use(initReactI18next).init({
  resources,
  lng: detectLanguage(),
  fallbackLng: "en",
  defaultNS: "common",
  ns: ["common", "game", "editor", "pages"],
  interpolation: { escapeValue: false },
  returnNull: false,
});

i18n.on("languageChanged", (lng) => {
  storage.set("pinpop:lang", lng);
  document.documentElement.lang = lng;
});
document.documentElement.lang = i18n.language;

export default i18n;
