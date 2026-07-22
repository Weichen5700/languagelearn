import { z } from "zod";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";

/**
 * 影片瀏覽紀錄：擴充在 youtube.com/watch 開頁時 ping 一次，供「最近瀏覽影片」知識庫視圖。
 * 單機單使用者，JSON 檔。以 videoId 去重，保留最新標題、累計次數、最後瀏覽時間。
 */

export const VisitSchema = z.object({
  videoId: z.string(),
  title: z.string().optional(),        // YouTube 頁面標題（document.title）
  source: z.enum(["youtube", "netflix", "manual"]).default("youtube"),
  visitCount: z.number().default(1),
  firstSeen: z.number(),
  lastSeen: z.number(),
});
export type Visit = z.infer<typeof VisitSchema>;

const STORE_DIR = join(process.cwd(), "..", "..", "data", "capture");
const STORE_FILE = join(STORE_DIR, "visits.json");

function ensure(): void {
  if (!existsSync(STORE_DIR)) mkdirSync(STORE_DIR, { recursive: true });
  if (!existsSync(STORE_FILE)) writeFileSync(STORE_FILE, "[]", "utf8");
}

function load(): Visit[] {
  ensure();
  try { return z.array(VisitSchema).parse(JSON.parse(readFileSync(STORE_FILE, "utf8"))); }
  catch { return []; }
}

function save(v: Visit[]): void { ensure(); writeFileSync(STORE_FILE, JSON.stringify(v, null, 2), "utf8"); }

const BodySchema = z.object({
  videoId: z.string().min(1).max(100),
  title: z.string().max(300).optional(),
  source: z.enum(["youtube", "netflix", "manual"]).optional(),
});
export function validateVisitBody(body: unknown) { return BodySchema.safeParse(body); }

export function recordVisit(input: z.infer<typeof BodySchema>): Visit {
  const now = Date.now();
  const all = load();
  const existing = all.find((v) => v.videoId === input.videoId);
  if (existing) {
    existing.visitCount += 1;
    existing.lastSeen = now;
    if (input.title) existing.title = input.title;
    save(all);
    return existing;
  }
  const v: Visit = {
    videoId: input.videoId,
    title: input.title,
    source: input.source ?? "youtube",
    visitCount: 1,
    firstSeen: now,
    lastSeen: now,
  };
  all.push(v);
  save(all);
  return v;
}

export function listVisits(): Visit[] {
  // lastSeem 降序；同毫秒時以瀏覽次數多的優先（避免時間解析度不足造成不穩定排序）
  return load().sort((a, b) => b.lastSeen - a.lastSeen || b.visitCount - a.visitCount);
}

export function _resetForTest(): void {
  ensure();
  writeFileSync(STORE_FILE, "[]", "utf8");
}