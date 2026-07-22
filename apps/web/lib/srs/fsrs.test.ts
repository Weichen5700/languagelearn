import { describe, it, expect } from "vitest";
import { newCard, review, type Rating, type SrsCard } from "./fsrs";

describe("FSRS newCard", () => {
  it("回傳初始狀態", () => {
    const c = newCard();
    expect(c.state).toBe("new");
    expect(c.reps).toBe(0);
    expect(c.lapses).toBe(0);
    expect(c.stability).toBeGreaterThan(0);
  });
});

describe("FSRS review - 新卡", () => {
  const NOW = Date.UTC(2026, 6, 20);

  it("評 Good (3) 後進入 review 狀態，間隔 >= 1 天", () => {
    const r = review(newCard(), 3 as Rating, NOW);
    expect(r.card.state).toBe("review");
    expect(r.card.reps).toBe(1);
    expect(r.card.lastReview).toBe(NOW);
    expect(r.intervalDays).toBeGreaterThanOrEqual(1);
    expect(r.due).toBeGreaterThan(NOW);
  });

  it("評 Again (1) 後進入 learning 狀態，短間隔", () => {
    const r = review(newCard(), 1 as Rating, NOW);
    expect(r.card.state).toBe("learning");
    expect(r.card.lapses).toBe(1);
    expect(r.intervalDays).toBe(1);
  });

  it("評 Easy (4) >= Good", () => {
    const good = review(newCard(), 3 as Rating, NOW);
    const easy = review(newCard(), 4 as Rating, NOW);
    expect(easy.intervalDays).toBeGreaterThanOrEqual(good.intervalDays);
  });

  it("評 Hard (2) <= Good", () => {
    const hard = review(newCard(), 2 as Rating, NOW);
    const good = review(newCard(), 3 as Rating, NOW);
    expect(hard.intervalDays).toBeLessThanOrEqual(good.intervalDays);
  });
});

describe("FSRS review - 複習卡", () => {
  it("連續 Good 評分間隔應 >= 1", () => {
    const now = Date.UTC(2026, 6, 20);
    let card: SrsCard = newCard();
    card = review(card, 3 as Rating, now).card;
    const i1 = review(card, 3 as Rating, now + 2 * 86400000).intervalDays;
    const i2 = review(card, 3 as Rating, now + 5 * 86400000).intervalDays;
    expect(i1).toBeGreaterThanOrEqual(1);
    expect(i2).toBeGreaterThanOrEqual(1);
  });

  it("答錯後 lapse +1 並進入 relearning", () => {
    const now = Date.UTC(2026, 6, 20);
    const card = review(newCard(), 3 as Rating, now).card;   // Good：lapses 不變
    expect(card.lapses).toBe(0);
    card.lastReview = now - 7 * 86400000;
    const r = review(card, 1 as Rating, now);             // Again：lapse +1
    expect(r.card.lapses).toBe(1);
    expect(r.card.state).toBe("relearning");
  });

  it("到期日 = 評分時間 + 間隔", () => {
    const now = Date.UTC(2026, 6, 20);
    const r = review(newCard(), 3 as Rating, now);
    expect(r.due - now).toBe(r.intervalDays * 86400000);
  });
});