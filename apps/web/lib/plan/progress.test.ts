import { describe, it, expect } from "vitest";
import { dayNumberOf, todayTask, computeProgress, distributeCards } from "./progress";
import type { Plan } from "@/lib/schemas";

const basePlan = (overrides: Partial<Plan> = {}): Plan => ({
  id: "p1",
  title: "西文 30 天",
  lang: "es",
  startDate: Date.UTC(2026, 6, 20),
  tasks: [
    { day: 1, cardIds: ["a", "b"], notes: undefined, done: false },
    { day: 2, cardIds: ["c"], notes: undefined, done: false },
    { day: 3, cardIds: ["d", "e", "f"], notes: undefined, done: false },
  ],
  progress: 0,
  ...overrides,
});

describe("dayNumberOf", () => {
  it("起始日當天 = 第 1 天", () => {
    expect(dayNumberOf(basePlan(), Date.UTC(2026, 6, 20))).toBe(1);
  });
  it("隔天 = 第 2 天", () => {
    expect(dayNumberOf(basePlan(), Date.UTC(2026, 6, 21))).toBe(2);
  });
  it("起始日前 = 第 0 天", () => {
    expect(dayNumberOf(basePlan(), Date.UTC(2026, 6, 19))).toBe(0);
  });
});

describe("todayTask", () => {
  it("回傳今日任務", () => {
    const t = todayTask(basePlan(), Date.UTC(2026, 6, 21));
    expect(t?.day).toBe(2);
    expect(t?.cardIds).toEqual(["c"]);
  });
  it("無對應 day 回 undefined", () => {
    expect(todayTask(basePlan(), Date.UTC(2026, 6, 25))).toBeUndefined();
  });
});

describe("computeProgress", () => {
  it("無任務完成 = 0%", () => {
    expect(computeProgress(basePlan())).toBe(0);
  });
  it("1/3 完成 = 33%", () => {
    const p = basePlan();
    p.tasks[0].done = true;
    expect(computeProgress(p)).toBe(33);
  });
  it("全部完成 = 100%", () => {
    const p = basePlan();
    p.tasks.forEach(t => { t.done = true; });
    expect(computeProgress(p)).toBe(100);
  });
});

describe("distributeCards", () => {
  it("平均分配到指定天數", () => {
    const tasks = distributeCards(["a", "b", "c", "d", "e"], 2);
    expect(tasks).toHaveLength(2);
    expect(tasks[0].cardIds).toEqual(["a", "b", "c"]);
    expect(tasks[1].cardIds).toEqual(["d", "e"]);
  });
  it("天數多於卡片時允許空 day", () => {
    const tasks = distributeCards(["a"], 3);
    expect(tasks).toHaveLength(3);
    expect(tasks[0].cardIds).toEqual(["a"]);
    expect(tasks[2].cardIds).toEqual([]);
  });
});