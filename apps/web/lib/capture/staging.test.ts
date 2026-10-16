import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  addCapture,
  listPending,
  listAll,
  markImported,
  clearImported,
  dedupKey,
  _resetForTest,
} from "./staging";
import { mergeCaptureToCard } from "./merge";
import type { Card } from "@/lib/schemas";

// vi.hoisted 讓 mock 與測試共享可變狀態（vi.mock 會被提升到檔案頂端）
const holder = vi.hoisted(() => ({
  savedCard: null as Card | null,
  imageStore: new Map<string, { id: string; mime: string; blob: { type: string }; createdAt: number }>(),
  cards: [] as Card[],
}));

vi.mock("@/lib/db", () => ({
  listDecks: vi.fn(async () => []),
  createDeck: vi.fn(async () => {}),
  listCards: vi.fn(async () => holder.cards.slice()),
  saveCard: vi.fn(async (c: Card) => {
    const i = holder.cards.findIndex(x => x.id === c.id);
    if (i >= 0) holder.cards[i] = c; else holder.cards.push(c);
    holder.savedCard = c;
  }),
  putImageBlob: vi.fn(async (row: { id: string }) => { holder.imageStore.set(row.id, row as never); }),
}));

// 整句中譯：mock 成固定譯文，不真打 API
vi.mock("@/lib/audio/translate", () => ({
  translateText: vi.fn(async () => ({ result: "（中譯）", cached: false, provider: "mock" })),
}));
vi.mock("@/lib/store/settings", () => ({
  loadSettings: vi.fn(() => ({ sourceLang: "zh", targetLang: "es", newCardsPerDay: 20, reviewsPerDay: 200, requestRetention: 0.9, playbackRate: 1, ytRate: 1 })),
}));

beforeEach(() => {
  _resetForTest();
});

const sample = {
  word: "gato",
  sentence: "El gato duerme.",
  videoId: "vid1",
  startSec: 12.5,
  source: "youtube" as const,
  lang: "es",
  translation: "貓",
};

describe("capture staging", () => {
  it("首次新增為 pending，且非重複", () => {
    const r = addCapture(sample);
    expect(r.duplicate).toBe(false);
    expect(r.entry.status).toBe("pending");
    expect(listPending()).toHaveLength(1);
  });

  it("同 word+sentence+lang 去重，回傳 duplicate=true", () => {
    addCapture(sample);
    const r2 = addCapture(sample);
    expect(r2.duplicate).toBe(true);
    expect(listAll()).toHaveLength(1);
  });

  it("大小寫不同但同字視為重複（dedupKey 用 lowercase）", () => {
    addCapture(sample);
    const r2 = addCapture({ ...sample, word: "GATO" });
    expect(r2.duplicate).toBe(true);
  });

  it("不同句視為不同擷取", () => {
    addCapture(sample);
    const r2 = addCapture({ ...sample, sentence: "El gato corre." });
    expect(r2.duplicate).toBe(false);
    expect(listAll()).toHaveLength(2);
  });

  it("既有 pending 補上缺失的翻譯/字典，仍回 duplicate", () => {
    addCapture({ ...sample, translation: undefined });
    const r2 = addCapture({ ...sample, translation: "貓", dictionaryEntry: { pos: "noun" } });
    expect(r2.duplicate).toBe(true);
    expect(r2.entry.translation).toBe("貓");
    expect(r2.entry.dictionaryEntry).toEqual({ pos: "noun" });
  });

  it("markImported 後不再出現在 listPending", () => {
    const r = addCapture(sample);
    expect(markImported(r.entry.id)).toBe(true);
    expect(listPending()).toHaveLength(0);
    expect(listAll()).toHaveLength(1);
    expect(markImported("nope")).toBe(false);
  });

  it("clearImported 只清 imported，保留 pending", () => {
    const r1 = addCapture({ ...sample, word: "a" });
    addCapture({ ...sample, word: "b" });
    markImported(r1.entry.id);
    expect(clearImported()).toBe(1);
    expect(listAll()).toHaveLength(1);
    expect(listPending()).toHaveLength(1);
  });

  it("dedupKey 格式穩定", () => {
    expect(dedupKey("Gato", "Hola.", "es")).toBe("es:gato|Hola.");
  });
});

describe("merge screenshot", () => {
  beforeEach(() => {
    _resetForTest();
    holder.savedCard = null;
    holder.imageStore.clear();
    holder.cards = [];
  });

  it("screenshot dataURL 轉 Blob 存入 imageBlobs 並設 media.imageId", async () => {
    // 1x1 PNG dataURL（合法 base64）
    const dataUrl = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/pLvAAAAAElFTkSuQmCC";
    const r = addCapture({ ...sample, screenshot: dataUrl });
    const m = await mergeCaptureToCard(r.entry);
    expect(m.created).toBe(true);
    expect(holder.savedCard?.media.imageId).toBe(`img-${r.entry.id}`);
    expect(holder.imageStore.has(`img-${r.entry.id}`)).toBe(true);
    expect(holder.imageStore.get(`img-${r.entry.id}`)?.mime).toBe("image/png");
    // 雙語對照：整句中譯一併存進 exampleTranslation
    expect(holder.savedCard?.exampleTranslation).toBe("（中譯）");
  });

  it("無 screenshot 時 media.imageId 為 undefined", async () => {
    const r = addCapture(sample);
    await mergeCaptureToCard(r.entry);
    expect(holder.savedCard?.media.imageId).toBeUndefined();
    expect(holder.imageStore.size).toBe(0);
  });
});

describe("merge scenario（情境卡）", () => {
  beforeEach(() => {
    _resetForTest();
    holder.savedCard = null;
    holder.imageStore.clear();
    holder.cards = [];
  });

  it("scenario 多句 → context.lines、example=聯接、front 帶情境標記、tag scenario", async () => {
    const r = addCapture({
      ...sample,
      word: "情境",
      sentence: "Hola.",
      scenario: [
        { text: "Hola.", startSec: 5 },
        { text: "¿Qué tal?", startSec: 7 },
        { text: "Bien.", startSec: 9 },
      ],
    });
    const m = await mergeCaptureToCard(r.entry);
    expect(m.created).toBe(true);
    expect(holder.savedCard?.context?.lines).toHaveLength(3);
    expect(holder.savedCard?.example).toBe("Hola. / ¿Qué tal? / Bien.");
    expect(holder.savedCard?.front).toMatch(/情境/);
    expect(holder.savedCard?.tags).toContain("scenario");
    // 整段中譯存進 exampleTranslation
    expect(holder.savedCard?.exampleTranslation).toBe("（中譯）");
  });

  it("情境去重：同 scenario 文字視為重複", async () => {
    const lines = [{ text: "A.", startSec: 1 }, { text: "B.", startSec: 2 }];
    const r1 = addCapture({ ...sample, word: "情境", sentence: "A.", scenario: lines });
    await mergeCaptureToCard(r1.entry);
    const r2 = addCapture({ ...sample, word: "情境", sentence: "A.", scenario: lines });
    const m2 = await mergeCaptureToCard(r2.entry);
    expect(m2.created).toBe(false);
    expect(m2.reason).toBe("duplicate");
  });
});