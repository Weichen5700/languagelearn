import { defineConfig, devices } from "@playwright/test";

// E2E 需先安裝系統函式庫：`sudo npx playwright install-deps chromium`
// （沙箱無 sudo 時 E2E 無法執行；單元測試已覆蓋 FSRS + 佇列邏輯）
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