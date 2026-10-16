import { test, expect } from "@playwright/test";

/**
 * E2E：本機學習設定（localStorage store）。
 * 驗證「編輯 → 儲存 → 重整後保留」與跨頁面同步，
 * 對應 lib/store/settings.ts + lib/store/hooks.ts（useSyncExternalStore）。
 */

test("設定頁：語速草稿即時反映、儲存後寫入 localStorage 並在重整後保留", async ({ page }) => {
  await page.goto("/settings");

  const ttsSlider = page.locator('input[type="range"]').first();

  // hydration 完成前 React 尚未接管 controlled input，fill 會被還原 → 重試直到生效
  await expect(async () => {
    await ttsSlider.fill("1.4");
    await expect(page.getByText("TTS 預設語速 (1.4x)")).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 15_000 });

  await page.getByRole("button", { name: /儲存學習偏好/ }).click();
  await expect(page.getByText("設定已成功儲存至本機")).toBeVisible();

  const stored = await page.evaluate(() => localStorage.getItem("flashcards.settings"));
  expect(stored).not.toBeNull();
  expect(JSON.parse(stored!).playbackRate).toBe(1.4);

  // 重整後由 localStorage 還原（useSyncExternalStore 讀取路徑）
  await page.reload();
  await expect(page.locator('input[type="range"]').first()).toHaveValue("1.4");
});

test("語速元件：跨頁面同步同一份設定", async ({ page }) => {
  await page.goto("/cards");
  await page.goto("/pronunciation");

  await page.getByRole("button", { name: "1.5×" }).first().click();

  const stored = await page.evaluate(() => localStorage.getItem("flashcards.settings"));
  expect(JSON.parse(stored!).playbackRate).toBe(1.5);

  // 元件本身即時反映選中狀態（store 訂閱通知）
  await expect(page.getByRole("button", { name: "1.5×" }).first()).toHaveClass(/text-white/);
});
