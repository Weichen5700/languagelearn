import type { Plan, PlanTask, Card } from "@/lib/schemas";
import { listCards } from "@/lib/db";

/**
 * 計畫進度計算 + 今日任務產出。
 *
 * 進度定義：已標記完成的 day 任務 / 總 day 任務（百分比）。
 * 「今日任務」= 依 startDate 推算今天是第幾天，取出該 day 的 cardIds。
 */

export function dayNumberOf(plan: Plan, now = Date.now()): number {
  const start = plan.startDate;
  if (now < start) return 0;
  return Math.floor((now - start) / 86_400_000) + 1;
}

export function todayTask(plan: Plan, now = Date.now()): PlanTask | undefined {
  const day = dayNumberOf(plan, now);
  return plan.tasks.find(t => t.day === day);
}

export function completedDays(plan: Plan): number {
  return plan.tasks.filter(t => t.done).length;
}

export function computeProgress(plan: Plan): number {
  if (plan.tasks.length === 0) return 0;
  return Math.round((completedDays(plan) / plan.tasks.length) * 100);
}

/** 取出今日任務的卡片完整資料。 */
export async function todayCards(plan: Plan, now = Date.now()): Promise<Card[]> {
  const task = todayTask(plan, now);
  if (!task || task.cardIds.length === 0) return [];
  const all = await listCards();
  const set = new Set(task.cardIds);
  return all.filter(c => set.has(c.id));
}

/** 自動把卡片平均分配到 N 天。 */
export function distributeCards(cardIds: string[], days: number): PlanTask[] {
  const tasks: PlanTask[] = [];
  const perDay = Math.ceil(cardIds.length / Math.max(1, days));
  for (let d = 1; d <= days; d++) {
    const slice = cardIds.slice((d - 1) * perDay, d * perDay);
    tasks.push({ day: d, cardIds: slice, notes: undefined, done: false });
  }
  return tasks;
}