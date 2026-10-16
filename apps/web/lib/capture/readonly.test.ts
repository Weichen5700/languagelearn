import { describe, it, expect, afterEach, vi } from "vitest";
import { mkdtempSync, chmodSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * 唯讀檔案系統（Vercel / serverless）行為：模組層快取讀取環境變數，
 * 因此必須先設 env、再 resetModules、最後動態 import。
 *
 * 以「chmod 0555 的暫存目錄」模擬唯讀 FS（比指向 /proc 之類特殊掛載可靠）。
 * 以 root 執行時權限檢查不生效，故跳過。
 */
const canTestReadOnly = typeof process.getuid === "function" && process.getuid() !== 0;

const createdRoots: string[] = [];

// 還原 vitest env 設定（避免影響同一 worker 內的其他測試檔）
const ORIGINAL_DIRS = {
  CAPTURE_STORE_DIR: process.env.CAPTURE_STORE_DIR,
  KEYS_STORE_DIR: process.env.KEYS_STORE_DIR,
};

function restoreDirs() {
  for (const [name, value] of Object.entries(ORIGINAL_DIRS)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
}

async function loadReadOnlyStoreModules() {
  const root = mkdtempSync(join(tmpdir(), "ll-readonly-"));
  chmodSync(root, 0o555);
  createdRoots.push(root);

  process.env.CAPTURE_STORE_DIR = join(root, "capture");
  process.env.KEYS_STORE_DIR = join(root, ".keys");
  vi.resetModules();

  return {
    staging: await import("./staging"),
    visits: await import("./visits"),
    keys: await import("@/lib/keys/store"),
  };
}

afterEach(() => {
  restoreDirs();
  vi.resetModules();
  for (const root of createdRoots.splice(0)) {
    chmodSync(root, 0o755);
    rmSync(root, { recursive: true, force: true });
  }
});

describe.skipIf(!canTestReadOnly)("唯讀檔案系統後備（serverless 情境）", () => {
  it("擷取暫存改走記憶體，回報非持久且流程不中斷", async () => {
    const { staging } = await loadReadOnlyStoreModules();
    expect(staging.isStagingPersistent()).toBe(false);

    staging.addCapture({
      word: "hola",
      sentence: "Hola, ¿qué tal?",
      videoId: "vid-1",
      startSec: 1,
      lang: "es",
    });

    expect(staging.listAll()).toHaveLength(1);
    expect(staging.listPending()).toHaveLength(1);
    expect(staging.markImported(staging.listPending()[0].id)).toBe(true);
    expect(staging.listPending()).toHaveLength(0);
  });

  it("瀏覽紀錄改走記憶體，回報非持久", async () => {
    const { visits } = await loadReadOnlyStoreModules();
    expect(visits.isVisitsPersistent()).toBe(false);

    visits.recordVisit({ videoId: "vid-1", title: "Demo" });
    expect(visits.listVisits()).toHaveLength(1);
  });

  it("Key 託管回報唯讀並拒絕寫入，避免產生無法解密的孤兒密文", async () => {
    const { keys } = await loadReadOnlyStoreModules();
    expect(keys.isStoreWritable()).toBe(false);

    expect(() => keys.setKey("GOOGLE_API_KEY", "AIza-fake")).toThrow(keys.KeyStoreReadOnlyError);
    expect(() => keys.deleteKey("GOOGLE_API_KEY")).toThrow(keys.KeyStoreReadOnlyError);
  });

  it("唯讀時仍可用環境變數讀 Key", async () => {
    process.env.GOOGLE_API_KEY = "env-key";
    try {
      const { keys } = await loadReadOnlyStoreModules();
      expect(keys.getKey("GOOGLE_API_KEY")).toBe("env-key");
      expect(keys.listKeyStatuses().find((k) => k.name === "GOOGLE_API_KEY")).toMatchObject({
        source: "env",
        set: true,
      });
    } finally {
      delete process.env.GOOGLE_API_KEY;
    }
  });
});
