import { join } from "node:path";
import { canWriteDir } from "@/lib/fsWritable";

/**
 * 擷取相關 JSON 暫存目錄（staging.json / visits.json）。
 *
 * 預設寫在 repo 根的 `data/capture/`（本機自架），可用 `CAPTURE_STORE_DIR`
 * 覆寫（例如 Docker volume 或 serverless 的 /tmp）。Vercel 之類的唯讀
 * 檔案系統會讓寫入失敗 → 呼叫端改用記憶體後備，流程不中斷（見 staging.ts）。
 */
export const CAPTURE_DIR =
  process.env.CAPTURE_STORE_DIR ?? join(process.cwd(), "..", "..", "data", "capture");

let writable: boolean | null = null;

/** 目錄是否可建立／寫入（結果快取，避免每次請求都探測）。 */
export function captureDirWritable(): boolean {
  if (writable === null) {
    writable = canWriteDir(CAPTURE_DIR);
  }
  return writable;
}

/** 測試用：清掉探測快取。 */
export function _resetWritableCacheForTest(): void {
  writable = null;
}
