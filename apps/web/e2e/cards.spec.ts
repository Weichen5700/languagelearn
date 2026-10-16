import { test, expect } from "@playwright/test";

/**
 * E2E：新增牌組 → 新增卡片 → 開始複習 → 翻卡 → 評分 → 完成。
 * 驗證 Phase 1 單字卡流程在真實瀏覽器中跑通（含 IndexedDB 離線儲存）。
 */
test("單字卡完整流程", async ({ page }) => {
  await page.goto("/cards");

  // 1. 建立牌組
  await page.getByRole("button", { name: "+ 新牌組" }).click();
  await page.getByPlaceholder("牌組名稱（例如：西文基礎 500、生活口語 100）").fill("測試牌組");
  await page.getByRole("button", { name: "建立", exact: true }).click();
  // <option> 沒有 layout box，Playwright 判定為 hidden → 用 attached 判斷
  await expect(page.getByRole("option", { name: /測試牌組/ })).toBeAttached();

  // 2. 新增卡片（需先有牌組，「+ 新增卡片」才會啟用）
  await page.getByRole("button", { name: "+ 新增卡片" }).click();
  await page.getByPlaceholder("例如：desarrollar、gracias…").fill("hola");
  await page.getByPlaceholder("例如：發展、謝謝…").fill("你好");
  await page.getByPlaceholder("例如：動詞, 日常, A1").fill("問候,測試");
  await page.getByRole("button", { name: /儲存卡片/ }).click();

  // 3. 卡片出現在清單（正面 / 反面）
  await expect(page.getByText("hola", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("你好", { exact: true }).first()).toBeVisible();

  // 4. 開始複習（等卡片載入完成再操作，否則翻卡狀態會被重置）
  await page.getByRole("button", { name: /開始複習/ }).click();
  await expect(page.getByText("hola", { exact: true }).first()).toBeVisible();

  // 5. 翻卡（Space）後看得到反面
  await page.keyboard.press("Space");
  await expect(page.getByText("你好", { exact: true }).first()).toBeVisible();

  // 6~7. 逐張評分「良好」（3），直到今日佇列清空。
  //      若本機或其他測試留下的資料讓佇列不只一張卡，這裡仍能跑完。
  for (let i = 0; i < 30; i++) {
    if (await page.getByText("今日複習完成！").isVisible().catch(() => false)) break;
    await page.keyboard.press("3");
    await page.waitForTimeout(250);
    if (await page.getByText("今日複習完成！").isVisible().catch(() => false)) break;
    await page.keyboard.press("Space"); // 下一張需先翻面才能評分
    await page.waitForTimeout(250);
  }

  await expect(page.getByText("今日複習完成！")).toBeVisible({ timeout: 5000 });
});