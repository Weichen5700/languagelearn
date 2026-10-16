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
  emit();
}

/* ---------- React 訂閱（供 useSyncExternalStore 使用） ---------- */

type Listener = () => void;
const listeners = new Set<Listener>();

export function subscribeProfile(listener: Listener): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

function emit(): void {
  for (const listener of listeners) listener();
}

let cachedRaw: string | null = null;
let cached: Profile | null = null;
let cachedReady = false;

export function getProfileSnapshot(): Profile | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(KEY);
  if (cachedReady && raw === cachedRaw) return cached;
  cachedReady = true;
  cachedRaw = raw;
  try { cached = raw ? JSON.parse(raw) : null; } catch { cached = null; }
  return cached;
}

export function getServerProfileSnapshot(): Profile | null {
  return null;
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