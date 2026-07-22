import { describe, it, expect } from "vitest";
import { aggregateDaily, cardStateDistribution, computeStreak, computeStats, formatDuration } from "./aggregate";
import type { Card, LogEntry } from "@/lib/schemas";

const NOW = Date.UTC(2026, 6, 20, 12, 0, 0);

function logAt(ts: number, timeSpentMs = 1000): LogEntry {
  return {
    id: `l${ts}`,
    cardId: "c1",
    action: "review",
    rating: 3,
    timeSpentMs,
    ts,
  };
}

function cardWith(state: Card["srs"]["state"]): Card {
  return {
    id: `c-${state}`,
    deckId: "d1",
    lang: "es",
    cardType: "basic",
    front: "x",
    back: "y",
    media: {},
    tags: [],
    srs: { stability: 1, difficulty: 5, lastReview: null, reps: 0, lapses: 0, state, due: 0 },
    createdAt: 0,
    updatedAt: 0,
  } as Card;
}

describe("aggregateDaily", () => {
  it("補滿 84 天，空日 count=0", () => {
    const daily = aggregateDaily([], 84);
    expect(daily).toHaveLength(84);
    expect(daily.every(d => d.count === 0)).toBe(true);
  });

  it("同一日多筆 log 合併 count + timeSpent", () => {
    const now = new Date();
    const day = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0);
    const logs = [logAt(day, 1500), logAt(day + 1000, 2500)];
    const daily = aggregateDaily(logs, 84);
    const merged = daily.find(d => d.count === 2);
    expect(merged).toBeDefined();
    expect(merged?.timeSpentMs).toBe(4000);
  });
});

describe("cardStateDistribution", () => {
  it("依 state 計數", () => {
    const cards = [cardWith("new"), cardWith("new"), cardWith("review"), cardWith("learning")];
    const d = cardStateDistribution(cards);
    expect(d.new).toBe(2);
    expect(d.review).toBe(1);
    expect(d.learning).toBe(1);
    expect(d.relearning).toBe(0);
  });
});

describe("computeStreak", () => {
  it("最後一天有複習則 streak=1", () => {
    const daily = [{ date: "x", count: 0, timeSpentMs: 0 }, { date: "y", count: 3, timeSpentMs: 0 }];
    expect(computeStreak(daily)).toBe(1);
  });
  it("連續多天", () => {
    const daily = [
      { date: "1", count: 0, timeSpentMs: 0 },
      { date: "2", count: 2, timeSpentMs: 0 },
      { date: "3", count: 1, timeSpentMs: 0 },
      { date: "4", count: 5, timeSpentMs: 0 },
    ];
    expect(computeStreak(daily)).toBe(3);
  });
  it("全空 = 0", () => {
    const daily = [{ date: "1", count: 0, timeSpentMs: 0 }];
    expect(computeStreak(daily)).toBe(0);
  });
});

describe("computeStats", () => {
  it("回傳完整統計物件", () => {
    const cards = [cardWith("new"), cardWith("review")];
    const logs = [logAt(NOW, 3000), logAt(NOW + 1000, 5000)];
    const s = computeStats(cards, logs, NOW);
    expect(s.totalCards).toBe(2);
    expect(s.totalReviews).toBe(2);
    expect(s.totalTimeSpentMs).toBe(8000);
    expect(s.stateDist.new).toBe(1);
    expect(s.stateDist.review).toBe(1);
    expect(s.daily).toHaveLength(84);
  });

  it("byType 與 immersionCards 計入沉浸卡", () => {
    const immersion: Card = {
      ...cardWith("new"),
      id: "c-imm",
      cardType: "immersion",
      context: { sentence: "El gato.", videoId: "v1", startSec: 5, source: "youtube", capturedAt: 1 },
    };
    const s = computeStats([cardWith("new"), cardWith("review"), immersion], []);
    expect(s.byType.immersion).toBe(1);
    expect(s.byType.basic).toBe(2);
    expect(s.immersionCards).toBe(1);
  });
});

describe("formatDuration", () => {
  it("秒", () => { expect(formatDuration(45_000)).toBe("45s"); });
  it("分", () => { expect(formatDuration(120_000)).toBe("2m"); });
  it("時分", () => { expect(formatDuration(3_780_000)).toBe("1h 3m"); });
});