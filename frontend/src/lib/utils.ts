import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/** Reads/writes localStorage without throwing in private mode or sandboxed iframes. */
export const storage = {
  get(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string): void {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* ignore */
    }
  },
  remove(key: string): void {
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  },
  getJSON<T>(key: string): T | null {
    const raw = storage.get(key);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  },
  setJSON(key: string, value: unknown): void {
    storage.set(key, JSON.stringify(value));
  },
};

const GRADIENTS = [
  "from-pop-500 to-tang-500",
  "from-[#1f9bff] to-[#12b886]",
  "from-[#b14dff] to-pop-500",
  "from-sun-500 to-tang-500",
  "from-[#12b886] to-[#84cc16]",
  "from-[#ff7ac6] to-[#b14dff]",
  "from-[#1f9bff] to-[#b14dff]",
];

/** Stable, decorative gradient for a quiz without a cover image. */
export function gradientFor(id: string): string {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return GRADIENTS[h % GRADIENTS.length] as string;
}

export function formatNumber(n: number, locale?: string): string {
  return new Intl.NumberFormat(locale).format(n);
}

export function formatDate(iso: string, locale?: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
}

export function copyText(text: string): Promise<void> {
  return navigator.clipboard.writeText(text);
}
