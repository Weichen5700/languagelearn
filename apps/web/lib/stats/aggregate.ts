import type { Card, LogEntry } from "@/lib/schemas";

/**
 * 統計聚合：把 logEntries + cards 轉成圖表用的資料。
 * 純函式，易測試。
 */

export interface DayBucket {
  date: string;        // YYYY-MM-DD
  count: number;       // 該日複習次數
  timeSpentMs: number; // 該日總學習時長
}

export interface StateDistribution {
  new: number;
  learning: number;
  review: number;
  relearning: number;
}

export interface Stats {
  totalCards: number;
  totalReviews: number;
  totalTimeSpentMs: number;
  dueToday: number;
  stateDist: StateDistribution;
  daily: DayBucket[];          // 依日期升序
  streak: number;              // 連續天數（含今天或最近一天）
  lastReviewDate: string | null;
  byType: Record<Card["cardType"], number>;   // 各卡型數量（含 immersion）
  immersionCards: number;                     // 沉浸式卡（從影片擷取）數量
}

function dateKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** 把 logEntries 聚合成每日 bucket。 */
export function aggregateDaily(logs: LogEntry[], days = 84): DayBucket[] {
  const map = new Map<string, DayBucket>();
  for (const l of logs) {
    const k = dateKey(l.ts);
    const b = map.get(k) ?? { date: k, count: 0, timeSpentMs: 0 };
    b.count += 1;
    b.timeSpentMs += l.timeSpentMs;
    map.set(k, b);
  }
  // 補滿最近 days 天（含空日）
  const out: DayBucket[] = [];
  const today = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const k = dateKey(d.getTime());
    out.push(map.get(k) ?? { date: k, count: 0, timeSpentMs: 0 });
  }
  return out;
}

/** 卡片狀態分布。 */
export function cardStateDistribution(cards: Card[]): StateDistribution {
  const dist: StateDistribution = { new: 0, learning: 0, review: 0, relearning: 0 };
  for (const c of cards) dist[c.srs.state] += 1;
  return dist;
}

/** 各卡型數量（含 immersion 沉浸卡）。 */
export function cardTypeDistribution(cards: Card[]): Record<Card["cardType"], number> {
  const t: Record<Card["cardType"], number> = { basic: 0, cloze: 0, ipa: 0, image: 0, immersion: 0 };
  for (const c of cards) t[c.cardType] = (t[c.cardType] ?? 0) + 1;
  return t;
}

/** 連續學習天數（從今天往回數直到出現空日）。 */
export function computeStreak(daily: DayBucket[]): number {
  // 由後往前
  let streak = 0;
  for (let i = daily.length - 1; i >= 0; i--) {
    if (daily[i].count > 0) streak++;
    else break;
  }
  return streak;
}

/** 主聚合函式。 */
export function computeStats(cards: Card[], logs: LogEntry[], now = Date.now()): Stats {
  const daily = aggregateDaily(logs);
  const stateDist = cardStateDistribution(cards);
  const byType = cardTypeDistribution(cards);
  const totalReviews = logs.length;
  const totalTimeSpentMs = logs.reduce((s, l) => s + l.timeSpentMs, 0);
  const dueToday = cards.filter(c => c.srs.due <= now).length;
  const lastLog = logs.length ? Math.max(...logs.map(l => l.ts)) : null;
  return {
    totalCards: cards.length,
    totalReviews,
    totalTimeSpentMs,
    dueToday,
    stateDist,
    daily,
    streak: computeStreak(daily),
    lastReviewDate: lastLog ? dateKey(lastLog) : null,
    byType,
    immersionCards: byType.immersion ?? 0,
  };
}

/** 時長人類可讀（如 1h 23m）。 */
export function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${s}s`;
}