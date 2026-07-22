import { z } from "zod";

/**
 * 使用者學習設定（純本地，存 localStorage）。
 * 翻譯方向（source/target）放這裡，不寫死在語言包。
 */
export const SettingsSchema = z.object({
  sourceLang: z.string().default("zh"),       // 母語 / 來源
  targetLang: z.string().default("es"),       // 目標外語
  newCardsPerDay: z.number().int().min(0).max(200).default(20),
  reviewsPerDay: z.number().int().min(0).max(1000).default(200),
  requestRetention: z.number().min(0.7).max(0.99).default(0.9),
  playbackRate: z.number().min(0.25).max(4).default(1),  // TTS 語速（1=正常）
  ytRate: z.number().min(0.25).max(2).default(1),        // YouTube 重看語速
});
export type Settings = z.infer<typeof SettingsSchema>;

const KEY = "flashcards.settings";

export function loadSettings(): Settings {
  if (typeof window === "undefined") return SettingsSchema.parse({});
  try {
    const raw = localStorage.getItem(KEY);
    return SettingsSchema.parse(raw ? JSON.parse(raw) : {});
  } catch {
    return SettingsSchema.parse({});
  }
}

export function saveSettings(s: Settings): void {
  localStorage.setItem(KEY, JSON.stringify(s));
}