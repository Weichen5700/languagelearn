import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock Dexie db 層（queue 依賴 listCards / saveCard / addLog）
const mockCards: Card[] = [];
vi.mock("@/lib/db", () => ({
  listCards: vi.fn(async () => mockCards.slice()),
  saveCard: vi.fn(async (c: Card) => { const i = mockCards.findIndex(x => x.id === c.id); if (i >= 0) mockCards[i] = c; else mockCards.push(c); }),
  addLog: vi.fn(async () => {}),
}));

// Mock settings（避免碰 localStorage）
vi.mock("@/lib/store/settings", () => ({
  loadSettings: () => ({ sourceLang: "zh", targetLang: "es", newCardsPerDay: 20, reviewsPerDay: 200, requestRetention: 0.9 }),
}));

import { buildReviewQueue, gradeCard, makeNewCardSrs } from "./queue";
import type { Card } from "@/lib/schemas";

function makeCard(overrides: Partial<Card> = {}): Card {
  return {
    id: crypto.randomUUID(),
    deckId: "d1",
    lang: "es",
    cardType: "basic",
    front: "hola",
    back: "你好",
    media: {},
    tags: [],
    srs: makeNewCardSrs(),
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  } as Card;
}

describe("buildReviewQueue", () => {
  beforeEach(() => { mockCards.length = 0; });

  it("新卡出現在佇列", async () => {
    mockCards.push(makeCard());
    const q = await buildReviewQueue();
    expect(q).toHaveLength(1);
    expect(q[0].kind).toBe("new");
  });

  it("未到期的 review 卡不出現", async () => {
    mockCards.push(makeCard({
      srs: { stability: 10, difficulty: 5, lastReview: Date.now(), reps: 1, lapses: 0, state: "review", due: Date.now() + 7 * 86400000 },
    }));
    const q = await buildReviewQueue();
    expect(q).toHaveLength(0);
  });

  it("到期的 review 卡出現", async () => {
    mockCards.push(makeCard({
      srs: { stability: 0.1, difficulty: 5, lastReview: Date.now() - 86400000, reps: 1, lapses: 0, state: "review", due: Date.now() - 1000 },
    }));
    const q = await buildReviewQueue();
    expect(q).toHaveLength(1);
    expect(q[0].kind).toBe("review");
  });

  it("learning 卡未到 due 不出現", async () => {
    mockCards.push(makeCard({
      srs: { stability: 0.1, difficulty: 5, lastReview: Date.now(), reps: 1, lapses: 1, state: "learning", due: Date.now() + 60000 },
    }));
    const q = await buildReviewQueue();
    expect(q).toHaveLength(0);
  });
});

describe("gradeCard", () => {
  beforeEach(() => { mockCards.length = 0; });

  it("評 Good 後 state 從 new 變 review，due > now", async () => {
    const card = makeCard();
    mockCards.push(card);
    const updated = await gradeCard(card, 3, 1500);
    expect(updated.srs.state).toBe("review");
    expect(updated.srs.reps).toBe(1);
    expect(updated.srs.due).toBeGreaterThan(Date.now());
  });

  it("評 Again 後 state 為 learning，lapses +1", async () => {
    const card = makeCard();
    mockCards.push(card);
    const updated = await gradeCard(card, 1, 2000);
    expect(updated.srs.state).toBe("learning");
    expect(updated.srs.lapses).toBe(1);
  });

  it("寫入 logEntries（含 timeSpentMs）", async () => {
    const { addLog } = await import("@/lib/db");
    const card = makeCard();
    mockCards.push(card);
    await gradeCard(card, 3, 3500);
    expect(addLog).toHaveBeenCalledWith(expect.objectContaining({ timeSpentMs: 3500, rating: 3 }));
  });
});