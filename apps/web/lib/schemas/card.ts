import { z } from "zod";

export const CardTypeSchema = z.enum(["basic", "cloze", "ipa", "image", "immersion"]);
export type CardType = z.infer<typeof CardTypeSchema>;

/**
 * 沉浸式學習來源的語境資料（YouTube/Netflix 等影片字幕擷取）。
 * 配合 cardType='immersion' 使用；其他卡型留空。
 */
export const CardContextSchema = z.object({
  sentence: z.string(),            // 整句原文（擷取當下該單字所在字幕句）
  videoId: z.string(),             // 影片 ID（YouTube 等），用於「重看這句」回回跳
  startSec: z.number(),            // 點擊當下字幕時間（秒）
  source: z.enum(["youtube", "netflix", "manual"]).default("youtube"),
  capturedAt: z.number(),          // 擷取時間 epoch ms
  lines: z.array(z.object({        // 情境卡：連續對話的多句（含各句時間）
    text: z.string(),
    startSec: z.number(),
  })).optional(),
});
export type CardContext = z.infer<typeof CardContextSchema>;

export const SrsStateSchema = z.object({
  stability: z.number(),
  difficulty: z.number(),
  lastReview: z.number().nullable(),
  reps: z.number(),
  lapses: z.number(),
  state: z.enum(["new", "learning", "review", "relearning"]),
  due: z.number(),                  // 下次到期 epoch ms（FSRS review() 結果）
});

export const CardSchema = z.object({
  id: z.string(),
  userId: z.string().optional(),
  deckId: z.string(),
  lang: z.string(),
  cardType: CardTypeSchema,
  front: z.string(),
  back: z.string(),
  ipa: z.string().optional(),
  example: z.string().optional(),
  exampleTranslation: z.string().optional(),  // 例句的母語譯文（雙語對照）
  clozeText: z.string().optional(),
  context: CardContextSchema.optional(),        // 沉浸式卡才有
  media: z.object({
    audioId: z.string().optional(),
    imageId: z.string().optional(),
  }).default({}),
  tags: z.array(z.string()).default([]),
  srs: SrsStateSchema,
  createdAt: z.number(),
  updatedAt: z.number(),
});

export type Card = z.infer<typeof CardSchema>;

export const DeckSchema = z.object({
  id: z.string(),
  userId: z.string().optional(),
  name: z.string(),
  lang: z.string(),
  description: z.string().optional(),
  cardCount: z.number().default(0),
});

export type Deck = z.infer<typeof DeckSchema>;

export const LogEntrySchema = z.object({
  id: z.string(),
  cardId: z.string(),
  userId: z.string().optional(),
  action: z.enum(["review", "learn", "cram"]),
  rating: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  timeSpentMs: z.number(),
  ts: z.number(),
});

export type LogEntry = z.infer<typeof LogEntrySchema>;