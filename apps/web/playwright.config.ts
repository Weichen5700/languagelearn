import { defineConfig, devices } from "@playwright/test";

// E2E 需要 Chromium + 系統函式庫：
//   sudo npx playwright install --with-deps chromium
// 若無 sudo，可將 libnspr4 / libnss3 / libasound2 等套件解開後以
//   LD_LIBRARY_PATH=<解開路徑>/usr/lib/x86_64-linux-gnu npx playwright test
// 執行（CI 由 .github/workflows/ci.yml 自動安裝相依）。
export default defineConfig({
  testDir: "./e2e",
  timeout: 30000,
  fullyParallel: true,
  retries: 0,
  reporter: "list",
  use: { baseURL: "http://localhost:3000", trace: "on-first-retry" },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 60000,
  },
});