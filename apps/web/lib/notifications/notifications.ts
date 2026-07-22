/**
 * 複習提醒：FSRS 到期卡主動通知。
 * - 站內橫幅 + 瀏覽器 Notification（需使用者授權）
 * - 每日最多通知一次（localStorage 記 last-notified date），不打擾
 * - 離線可用（只讀 IndexedDB 卡片 due）
 */

export function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

const LAST_KEY = "flashcards.lastNotified";

export function alreadyNotifiedToday(): boolean {
  if (typeof window === "undefined") return true;
  return localStorage.getItem(LAST_KEY) === todayKey();
}

export function markNotifiedToday(): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(LAST_KEY, todayKey());
}

export function notificationsSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

export async function ensurePermission(): Promise<NotificationPermission> {
  if (!notificationsSupported()) return "denied";
  if (Notification.permission === "granted" || Notification.permission === "denied") return Notification.permission;
  try { return await Notification.requestPermission(); }
  catch { return "denied"; }
}

export function fireNotification(title: string, body: string, onClick?: () => void): void {
  if (!notificationsSupported() || Notification.permission !== "granted") return;
  try {
    const n = new Notification(title, { body, tag: "review-reminder" });
    if (onClick) n.onclick = onClick;
  } catch { /* ignore */ }
}