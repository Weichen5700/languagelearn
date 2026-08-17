import { listCards, saveCard, createDeck, listDecks, putImageBlob } from "@/lib/db";
import { makeNewCardSrs } from "@/lib/review/queue";
import { translateText } from "@/lib/audio/translate";
import { loadSettings } from "@/lib/store/settings";
import type { Card } from "@/lib/schemas";
import type { CaptureEntry } from "./staging";

interface DictShape {
  ipa?: string;
  partOfSpeech?: string;
  definitions?: string[];
  examples?: { text: string; translation?: string }[];
  dictExamples?: string[];
}

/** 把擴充傳回的自由形態 dictionaryEntry 正規化成卡片欄位（容錯）。 */
function normalizeDictionaryEntry(raw: unknown): {
  ipa?: string;
  partOfSpeech?: string;
  definitions?: string[];
  dictExamples?: string[];
} {
  if (!raw || typeof raw !== "object") return {};
  const d = raw as DictShape;
  const ipa = typeof d.ipa === "string" && d.ipa.trim() ? d.ipa.trim() : undefined;
  const partOfSpeech = typeof d.partOfSpeech === "string" && d.partOfSpeech.trim() ? d.partOfSpeech.trim() : undefined;
  const definitions = Array.isArray(d.definitions)
    ? d.definitions.filter((x): x is string => typeof x === "string" && !!x.trim()).slice(0, 5)
    : undefined;
  const dictExamples = Array.isArray(d.examples)
    ? d.examples.map((x) => x?.text).filter((x): x is string => typeof x === "string" && !!x.trim()).slice(0, 3)
    : Array.isArray(d.dictExamples)
      ? d.dictExamples.filter((x): x is string => typeof x === "string" && !!x.trim()).slice(0, 3)
      : undefined;
  const out: Record<string, unknown> = {};
  if (ipa) out.ipa = ipa;
  if (partOfSpeech) out.partOfSpeech = partOfSpeech;
  if (definitions?.length) out.definitions = definitions;
  if (dictExamples?.length) out.dictExamples = dictExamples;
  return out;
}

/** dataURL（如 data:image/jpeg;base64,...）轉 Blob；格式無效回 null（不拋錯）。 */
function dataUrlToBlob(dataUrl: string): Blob | null {
  try {
    const m = dataUrl.match(/^data:([^;]+);base64,(.*)$/);
    if (!m) return null;
    const mime = m[1];
    const bin = atob(m[2]);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: mime });
  } catch {
    return null;
  }
}

/**
 * 將 capture staging 的擷取合併進 IndexedDB 為 immersion 卡。
 * 去重：同 word+sentence+lang 已有卡就不重建。
 * deck：自動建立「沉浸（YouTube）」deck（以 lang 區分），沒有就建。
 */

const IMMERSION_DECK_PREFIX = "沉浸（影片）";

export async function ensureImmersionDeck(lang: string): Promise<string> {
  const decks = await listDecks();
  const name = `${IMMERSION_DECK_PREFIX} · ${lang}`;
  const existing = decks.find((d) => d.lang === lang && d.name === name);
  if (existing) return existing.id;
  const id = `deck-immersion-${lang}`;
  if (!decks.find((d) => d.id === id)) {
    await createDeck({
      id,
      name,
      lang,
      description: "從 YouTube/Netflix 字幕點擊擷取的單字（自動建立）",
      cardCount: 0,
    });
  }
  return id;
}

export interface MergeResult {
  created: boolean;
  cardId?: string;
  reason?: "duplicate" | "error";
}

export async function mergeCaptureToCard(entry: CaptureEntry): Promise<MergeResult> {
  try {
    const deckId = await ensureImmersionDeck(entry.lang);
    const all = await listCards(deckId);
    const isScenario = !!(entry.scenario && entry.scenario.length > 0);
    const joinedLines = isScenario
      ? entry.scenario!.map((l) => l.text.trim()).filter(Boolean).join(" / ")
      : "";
    const dupKey = isScenario ? joinedLines : entry.sentence.trim();
    const dup = all.find(
      (c) =>
        c.cardType === "immersion" &&
        c.context &&
        (isScenario
          ? (c.context.lines && c.context.lines.map((l) => l.text.trim()).join(" / ") === dupKey)
          : (c.front.trim().toLowerCase() === entry.word.trim().toLowerCase() &&
             c.context.sentence.trim() === dupKey)),
    );
    if (dup) return { created: false, reason: "duplicate", cardId: dup.id };

    const now = Date.now();
    let media: Card["media"] = {};
    // 擷取當下影格 → 存進 IndexedDB imageBlobs，media.imageId 指向它
    if (entry.screenshot) {
      const blob = dataUrlToBlob(entry.screenshot);
      if (blob) {
        const imageId = `img-${entry.id}`;
        await putImageBlob({ id: imageId, mime: blob.type, blob, createdAt: now });
        media = { imageId };
      }
    }
    // 翻譯目標文字（情境=整段；單字卡=整句），字幕語 → 母語
    const sourceText = isScenario ? joinedLines : entry.sentence;
    let exampleTranslation: string | undefined;
    try {
      const to = loadSettings().sourceLang;
      const r = await translateText(sourceText, entry.lang, to);
      exampleTranslation = r.result;
    } catch { exampleTranslation = undefined; }

    const context: Card["context"] = {
      sentence: isScenario ? (entry.scenario![0]?.text ?? "") : entry.sentence,
      videoId: entry.videoId,
      startSec: isScenario ? (entry.scenario![0]?.startSec ?? entry.startSec) : entry.startSec,
      source: entry.source,
      capturedAt: entry.capturedAt,
    };
    if (isScenario) context.lines = entry.scenario;

    // 字典資訊（詞性 / IPA / 釋義 / 例句）—擴充查詢時一併帶回，存進卡片
    const dict = normalizeDictionaryEntry(entry.dictionaryEntry);

    const card: Card = {
      id: `imm-${entry.id}`,
      deckId,
      lang: entry.lang,
      cardType: "immersion",
      front: isScenario ? `🎬 情境 · ${entry.scenario!.length} 句` : entry.word,
      back: isScenario ? (exampleTranslation ?? "") : (entry.translation ?? ""),
      ipa: dict.ipa,
      partOfSpeech: dict.partOfSpeech,
      definitions: dict.definitions,
      dictExamples: dict.dictExamples,
      example: isScenario ? joinedLines : entry.sentence,
      exampleTranslation,
      context,
      tags: isScenario ? ["immersion", "scenario", entry.source] : ["immersion", entry.source],
      media,
      srs: makeNewCardSrs(),
      createdAt: now,
      updatedAt: now,
    };
    await saveCard(card);
    return { created: true, cardId: card.id };
  } catch {
    return { created: false, reason: "error" };
  }
}

/** 把一批 pending 全數合併，回傳結果（供網站開啟時補傳）。 */
export async function mergeAll(entries: CaptureEntry[]): Promise<{
  merged: number;
  duplicates: number;
  importedIds: string[];
}> {
  let merged = 0, duplicates = 0;
  const importedIds: string[] = [];
  for (const e of entries) {
    const r = await mergeCaptureToCard(e);
    if (r.created) { merged++; importedIds.push(e.id); }
    else if (r.reason === "duplicate") { duplicates++; importedIds.push(e.id); }
  }
  return { merged, duplicates, importedIds };
}