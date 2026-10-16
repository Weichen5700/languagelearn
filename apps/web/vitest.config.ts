import { defineConfig } from "vitest/config";
import path from "node:path";
import { tmpdir } from "node:os";

export default defineConfig({
  test: {
    environment: "node",
    include: ["**/*.test.ts"],
    coverage: { provider: "v8", reporter: ["text", "html"] },
    env: {
      // 單元測試不寫入 repo 的 data/（否則會污染本機 develop 的暫存，
      // 並讓緊接著執行的 E2E 多出非預期的擷取卡）
      CAPTURE_STORE_DIR: path.join(tmpdir(), `languagelearn-vitest-${process.pid}`, "capture"),
      KEYS_STORE_DIR: path.join(tmpdir(), `languagelearn-vitest-${process.pid}`, ".keys"),
    },
  },
  resolve: {
    alias: { "@": path.resolve(__dirname) },
  },
});