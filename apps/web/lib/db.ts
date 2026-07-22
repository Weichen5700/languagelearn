import Dexie, { type Table } from "dexie";
import type { Card, Deck, LogEntry, Plan } from "@/lib/schemas";

/**
 * IndexedDB 資料庫（離線優先）。
 * 表：
 *  - decks：卡片分組
 *  - cards：單字卡（含 FSRS 狀態）
 *  - logEntries：每次複習紀錄（含 timeSpentMs）
 *  - audioBlobs：TTS 預抓音檔（voice+text -> Blob）
 */
export interface AudioBlobRow {
  id: string;        // = audioId(voice, text)
  voice: string;
  text: string;
  blob: Blob;
  createdAt: number;
}

/** 影片截圖 Blob（擷取當下的影格），供 immersion 卡複習時顯示。 */
export interface ImageBlobRow {
  id: string;
  mime: string;
  blob: Blob;
  createdAt: number;
}

class FlashcardsDB extends Dexie {
  decks!: Table<Deck, string>;
  cards!: Table<Card, string>;
  logEntries!: Table<LogEntry, string>;
  audioBlobs!: Table<AudioBlobRow, string>;
  imageBlobs!: Table<ImageBlobRow, string>;
  plans!: Table<Plan, string>;

  constructor() {
    super("flashcards");
    this.version(1).stores({
      decks: "id, name, lang",
      cards: "id, deckId, lang, tags, srs.state, srs.due",
      logEntries: "id, cardId, ts",
      audioBlobs: "id, voice, text, createdAt",
    });
    this.version(2).stores({
      plans: "id, lang, startDate",
    });
    // v3：沉浸式卡（context）索引，供 /cards 篩「從影片來的」、/stats 看占比
    // v4：imageBlobs 表存影片截圖 Blob，供 immersion 卡複習時顯示
    this.version(3).stores({
      decks: "id, name, lang",
      cards: "id, deckId, lang, cardType, tags, srs.state, srs.due, context.source",
      logEntries: "id, cardId, ts",
      audioBlobs: "id, voice, text, createdAt",
      plans: "id, lang, startDate",
    });
    this.version(4).stores({
      decks: "id, name, lang",
      cards: "id, deckId, lang, cardType, tags, srs.state, srs.due, context.source",
      logEntries: "id, cardId, ts",
      audioBlobs: "id, voice, text, createdAt",
      imageBlobs: "id, createdAt",
      plans: "id, lang, startDate",
    });
  }
}

// 瀏覽器環境才建立實例（SSR 不會用到 Dexie）
let _db: FlashcardsDB | null = null;
export function getDB(): FlashcardsDB {
  if (typeof window === "undefined") throw new Error("Dexie only available in browser");
  if (!_db) _db = new FlashcardsDB();
  return _db;
}

// ===== Deck =====
export async function listDecks(): Promise<Deck[]> {
  return getDB().decks.toArray();
}

export async function createDeck(deck: Deck): Promise<void> {
  await getDB().decks.put(deck);
}

export async function deleteDeck(id: string): Promise<void> {
  await getDB().transaction("rw", getDB().decks, getDB().cards, async () => {
    await getDB().cards.where("deckId").equals(id).delete();
    await getDB().decks.delete(id);
  });
}

// ===== Card =====
export async function listCards(deckId?: string): Promise<Card[]> {
  return deckId ? getDB().cards.where("deckId").equals(deckId).toArray() : getDB().cards.toArray();
}

export async function getCard(id: string): Promise<Card | undefined> {
  return getDB().cards.get(id);
}

export async function saveCard(card: Card): Promise<void> {
  await getDB().cards.put(card);
  // 同步 deck.cardCount
  const count = await getDB().cards.where("deckId").equals(card.deckId).count();
  await getDB().decks.update(card.deckId, { cardCount: count });
}

export async function deleteCard(id: string): Promise<void> {
  const card = await getCard(id);
  await getDB().cards.delete(id);
  if (card) {
    const count = await getDB().cards.where("deckId").equals(card.deckId).count();
    await getDB().decks.update(card.deckId, { cardCount: count });
  }
}

// ===== LogEntry =====
export async function addLog(entry: LogEntry): Promise<void> {
  await getDB().logEntries.put(entry);
}

export async function listLogs(cardId?: string): Promise<LogEntry[]> {
  return cardId ? getDB().logEntries.where("cardId").equals(cardId).toArray() : getDB().logEntries.toArray();
}

// ===== Audio Blob =====
export async function getAudioBlob(id: string): Promise<AudioBlobRow | undefined> {
  return getDB().audioBlobs.get(id);
}

export async function putAudioBlob(row: AudioBlobRow): Promise<void> {
  await getDB().audioBlobs.put(row);
}

// ===== Image Blob（影片截圖） =====
export async function getImageBlob(id: string): Promise<ImageBlobRow | undefined> {
  return getDB().imageBlobs.get(id);
}

export async function putImageBlob(row: ImageBlobRow): Promise<void> {
  await getDB().imageBlobs.put(row);
}

// ===== Plan =====
export async function listPlans(): Promise<Plan[]> {
  return getDB().plans.toArray();
}

export async function getPlan(id: string): Promise<Plan | undefined> {
  return getDB().plans.get(id);
}

export async function savePlan(plan: Plan): Promise<void> {
  await getDB().plans.put(plan);
}

export async function deletePlan(id: string): Promise<void> {
  await getDB().plans.delete(id);
}