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

/** 預設值（模組層級常數：伺服器端 snapshot 需保持參照穩定）。 */
export const DEFAULT_SETTINGS: Settings = SettingsSchema.parse({});

function parseSettings(raw: string | null): Settings {
  try {
    return SettingsSchema.parse(raw ? JSON.parse(raw) : {});
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function loadSettings(): Settings {
  if (typeof window === "undefined") return { ...DEFAULT_SETTINGS };
  return parseSettings(localStorage.getItem(KEY));
}

export function saveSettings(s: Settings): void {
  localStorage.setItem(KEY, JSON.stringify(s));
  emit();
}

/* ---------- React 訂閱（供 useSyncExternalStore 使用） ---------- */

type Listener = () => void;
const listeners = new Set<Listener>();

export function subscribeSettings(listener: Listener): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

function emit(): void {
  for (const listener of listeners) listener();
}

let cachedRaw: string | null = null;
let cached: Settings = DEFAULT_SETTINGS;
let cachedReady = false;

/** 同一份 localStorage 內容固定回傳同一物件參照（useSyncExternalStore 必要條件）。 */
export function getSettingsSnapshot(): Settings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  const raw = localStorage.getItem(KEY);
  if (cachedReady && raw === cachedRaw) return cached;
  cachedReady = true;
  cachedRaw = raw;
  cached = parseSettings(raw);
  return cached;
}

/** 首次渲染（SSR / hydration）用：先給預設值，掛載後再切換為本機實際值。 */
export function getServerSettingsSnapshot(): Settings {
  return DEFAULT_SETTINGS;
}