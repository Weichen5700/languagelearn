import { test, expect } from "@playwright/test";

/**
 * E2E：新增牌組 -> 新增卡片 -> 複習 -> 評分 -> 完成。
 * 驗證整個 Phase 1 流程在瀏覽器中跑通。
 */
test("單字卡完整流程", async ({ page }) => {
  await page.goto("/cards");

  // 1. 建立牌組
  await page.click("text=+ 新牌組");
  await page.fill("placeholder=/牌組名稱（如 西文基礎 500）/", "測試牌組");
  await page.click("text=建立");
  await expect(page.locator("option", { hasText: "測試牌組" })).toBeVisible();

  // 2. 新增卡片
  await page.click("text=+ 新增卡片");
  await page.fill("placeholder=/正面（目標語，如 hola）/", "hola");
  await page.fill("placeholder=/反面（母語，如 你好）/", "你好");
  await page.fill("placeholder=/標籤（逗號分隔，如 问候,基礎）/", "问候,測試");
  await page.click("text=儲存");
  await expect(page.locator("text=hola → 你好")).toBeVisible();

  // 3. 開始複習
  await page.click("text=開始複習");

  // 4. 翻卡（Space）
  await page.keyboard.press("Space");
  await expect(page.locator("text=你好")).toBeVisible();

  // 5. 評分 Good（3）
  await page.keyboard.press("3");

  // 6. 應顯示完成訊息（只有一張卡）
  await expect(page.locator("text=今日複習完成")).toBeVisible({ timeout: 5000 });
});