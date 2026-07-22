/**
 * 本機設定檔（多使用者，純本地，免後端帳號）。
 * 真正雲端帳號（NextAuth + Postgres）為未來工作，見 PLAN.md。
 */

const KEY = "flashcards.profile";

export interface Profile {
  id: string;
  name: string;
  createdAt: number;
}

export function loadProfile(): Profile | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export function saveProfile(p: Profile): void {
  localStorage.setItem(KEY, JSON.stringify(p));
}

export function ensureProfile(name = "我"): Profile {
  const existing = loadProfile();
  if (existing) return existing;
  const p: Profile = { id: crypto.randomUUID(), name, createdAt: Date.now() };
  saveProfile(p);
  return p;
}

export function renameProfile(name: string): Profile {
  const existing = loadProfile();
  const p: Profile = existing
    ? { ...existing, name }
    : { id: crypto.randomUUID(), name, createdAt: Date.now() };
  saveProfile(p);
  return p;
}