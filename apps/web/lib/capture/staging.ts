import { z } from "zod";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";

/**
 * Capture staging：Chrome 擴充在 youtube.com 點字幕擷取的單字，先存本地檔案，
 * 再由網站端（開啟時）合併進 IndexedDB。單機單使用者，JSON 檔足夠；
 * 離線/未開網站時暫存，開站時自動合併。
 *
 * 去重：hash(word_lower + sentence + lang)，同一句同一字不重複入庫。
 */

export const CaptureSourceSchema = z.enum(["youtube", "netflix", "manual"]);
export type CaptureSource = z.infer<typeof CaptureSourceSchema>;

export const CaptureEntrySchema = z.object({
  id: z.string(),
  word: z.string(),                          // 被點擊的單字（原形）
  sentence: z.string(),                      // 整句原文
  videoId: z.string(),
  startSec: z.number(),
  source: CaptureSourceSchema.default("youtube"),
  lang: z.string(),                          // 目標語言（字幕語言）
  translation: z.string().optional(),        // 擴充查到的譯文
  dictionaryEntry: z.unknown().optional(),    // 字典結果（自由形態）
  screenshot: z.string().optional(),          // 擷取當下影格（JPEG dataURL，base64）
  scenario: z.array(z.object({ text: z.string(), startSec: z.number() })).optional(), // 情境：多句
  capturedAt: z.number(),
  status: z.enum(["pending", "imported"]).default("pending"),
});
export type CaptureEntry = z.infer<typeof CaptureEntrySchema>;

// 專案根 data/capture/（apps/web 上一層兩層 = repo 根）
const STORE_DIR = join(process.cwd(), "..", "..", "data", "capture");
const STORE_FILE = join(STORE_DIR, "staging.json");

export const captureBus = new EventEmitter();
captureBus.setMaxListeners(50);

function ensureStore(): void {
  if (!existsSync(STORE_DIR)) mkdirSync(STORE_DIR, { recursive: true });
  if (!existsSync(STORE_FILE)) writeFileSync(STORE_FILE, "[]", "utf8");
}

function loadAll(): CaptureEntry[] {
  ensureStore();
  const raw = readFileSync(STORE_FILE, "utf8");
  try {
    return z.array(CaptureEntrySchema).parse(JSON.parse(raw));
  } catch {
    return [];
  }
}

function persistAll(entries: CaptureEntry[]): void {
  ensureStore();
  writeFileSync(STORE_FILE, JSON.stringify(entries, null, 2), "utf8");
}

export function dedupKey(word: string, sentence: string, lang: string): string {
  return `${lang}:${word.trim().toLowerCase()}|${sentence.trim()}`;
}

const BodySchema = z.object({
  word: z.string().min(1).max(200),
  sentence: z.string().min(1).max(2000),
  videoId: z.string().min(1).max(100),
  startSec: z.number().min(0),
  source: CaptureSourceSchema.optional(),
  lang: z.string().min(1).max(20),
  translation: z.string().optional(),
  dictionaryEntry: z.unknown().optional(),
  screenshot: z.string().optional(),          // JPEG dataURL（base64）
  scenario: z.array(z.object({ text: z.string(), startSec: z.number() })).optional(),
});

export function validateCaptureBody(body: unknown) {
  return BodySchema.safeParse(body);
}

export interface AddResult {
  entry: CaptureEntry;
  duplicate: boolean;
}

export function addCapture(input: z.infer<typeof BodySchema>): AddResult {
  const entries = loadAll();
  const key = dedupKey(input.word, input.sentence, input.lang);
  const existing = entries.find((e) => dedupKey(e.word, e.sentence, e.lang) === key);
  if (existing) {
    let changed = false;
    if (!existing.translation && input.translation) { existing.translation = input.translation; changed = true; }
    if (existing.dictionaryEntry === undefined && input.dictionaryEntry !== undefined) {
      existing.dictionaryEntry = input.dictionaryEntry; changed = true;
    }
    if (changed) persistAll(entries);
    return { entry: existing, duplicate: true };
  }

  const entry: CaptureEntry = {
    id: randomUUID(),
    word: input.word,
    sentence: input.sentence,
    videoId: input.videoId,
    startSec: input.startSec,
    source: input.source ?? "youtube",
    lang: input.lang,
    translation: input.translation,
    dictionaryEntry: input.dictionaryEntry,
    screenshot: input.screenshot,
    scenario: input.scenario,
    capturedAt: Date.now(),
    status: "pending",
  };
  entries.push(entry);
  persistAll(entries);
  captureBus.emit("capture", entry);
  return { entry, duplicate: false };
}

export function listPending(): CaptureEntry[] {
  return loadAll().filter((e) => e.status === "pending");
}

export function listAll(): CaptureEntry[] {
  return loadAll();
}

export function markImported(id: string): boolean {
  const entries = loadAll();
  const e = entries.find((x) => x.id === id);
  if (!e) return false;
  e.status = "imported";
  persistAll(entries);
  return true;
}

export function clearImported(): number {
  const entries = loadAll();
  const remaining = entries.filter((e) => e.status === "pending");
  const removed = entries.length - remaining.length;
  persistAll(remaining);
  return removed;
}

export function _resetForTest(): void {
  ensureStore();
  writeFileSync(STORE_FILE, "[]", "utf8");
  captureBus.removeAllListeners("capture");
}