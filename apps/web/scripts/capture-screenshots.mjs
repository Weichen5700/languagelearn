#!/usr/bin/env node
/**
 * 產生 README 用的畫面截圖到 `docs/screenshots/`。
 *
 * 使用方式（需先讓網站跑起來）：
 *   npm run dev                 # 另開一個終端機（或 npm run start）
 *   npm run shots               # 預設 BASE_URL=http://localhost:3000
 *
 * 每次都用全新的瀏覽器 profile（IndexedDB 是空的），因此會即時建立示範資料：
 * 一個牌組 + 5 張單字卡、透過 `/api/capture` 灌 3 筆影片擷取（變成沉浸卡）、
 * 跑完一輪複習讓 /stats 有數據，最後逐頁截圖。
 */
import { chromium, expect } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = process.env.OUT_DIR ?? path.resolve(HERE, "../../../docs/screenshots");

const DEMO_DECK = "西班牙語 · 生活口語";
const DEMO_CARDS = [
  ["hola", "你好", "問候,日常"],
  ["gracias", "謝謝", "問候,日常"],
  ["la biblioteca", "圖書館", "名詞,場所"],
  ["ayer", "昨天", "時間"],
  ["¿cómo estás?", "你好嗎？", "問候,句子"],
];

const DEMO_CAPTURES = [
  { word: "desarrollar", sentence: "Vamos a desarrollar una aplicación nueva.", translation: "我們要開發一個新的應用程式。", videoId: "jNQXAC9IVRw", startSec: 42 },
  { word: "el barrio", sentence: "Mi barrio es muy tranquilo por la mañana.", translation: "我的社區早上很安靜。", videoId: "dQw4w9WgXcQ", startSec: 118 },
  { word: "aprovechar", sentence: "Hay que aprovechar el tiempo libre.", translation: "要好好利用空閒時間。", videoId: "jNQXAC9IVRw", startSec: 305 },
];

const SHOTS = [
  ["home", "/"],
  ["cards", "/cards"],
  ["library", "/library"],
  ["plans", "/plans"],
  ["stats", "/stats"],
  ["pronunciation", "/pronunciation"],
  ["settings", "/settings"],
];

/** 假的影片影格（沉浸卡截圖），避免截圖裡出現破圖。 */
async function frameJpeg(label) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="270">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0f172a"/><stop offset="100%" stop-color="#1e3a8a"/>
    </linearGradient></defs>
    <rect width="480" height="270" fill="url(#g)"/>
    <circle cx="240" cy="112" r="34" fill="#ffffff" opacity="0.85"/>
    <path d="M230 94 L262 112 L230 130 Z" fill="#0f172a"/>
    <text x="24" y="238" font-family="sans-serif" font-size="22" fill="#e2e8f0">${label}</text>
  </svg>`;
  const buf = await sharp(Buffer.from(svg)).jpeg({ quality: 82 }).toBuffer();
  return `data:image/jpeg;base64,${buf.toString("base64")}`;
}

async function seedCaptures() {
  let ok = 0;
  for (const [i, c] of DEMO_CAPTURES.entries()) {
    const body = {
      ...c,
      lang: "es",
      source: "youtube",
      screenshot: await frameJpeg(`YouTube · ${String(i + 1).padStart(2, "0")}:${c.startSec % 60}`),
      dictionaryEntry: { word: c.word, partOfSpeech: "verb", definitions: [c.translation], examples: [{ text: c.sentence }] },
    };
    try {
      const res = await fetch(`${BASE}/api/capture`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) ok++;
    } catch {
      /* 站台沒開時讓 Playwright 直接失敗，錯誤訊息更清楚 */
    }
  }
  console.log(`· 已灌入 ${ok}/${DEMO_CAPTURES.length} 筆影片擷取`);
}

async function seedDeckAndCards(page) {
  await page.goto(`${BASE}/cards`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "+ 新牌組" }).click();
  await page.getByPlaceholder("牌組名稱（例如：西文基礎 500、生活口語 100）").fill(DEMO_DECK);
  await page.getByRole("button", { name: "建立", exact: true }).click();
  await page.getByRole("option", { name: new RegExp(DEMO_DECK) }).waitFor({ state: "attached" });

  for (const [front, back, tags] of DEMO_CARDS) {
    await page.getByRole("button", { name: "+ 新增卡片" }).click();
    await page.getByPlaceholder("例如：desarrollar、gracias…").fill(front);
    await page.getByPlaceholder("例如：發展、謝謝…").fill(back);
    await page.getByPlaceholder("例如：動詞, 日常, A1").fill(tags);
    await page.getByRole("button", { name: /儲存卡片/ }).click();
    await page.getByText(front, { exact: true }).first().waitFor();
  }
}

/** 跑完一輪複習（翻卡 + 全部評「良好」），讓 /stats 有資料。 */
async function runReview(page) {
  await page.getByRole("button", { name: /開始複習/ }).click();
  await page.waitForTimeout(500);
  await shot(page, "review-question");

  await page.keyboard.press("Space");
  await page.waitForTimeout(400);
  await shot(page, "review-answer");

  // 第一張已翻面 → 直接評分；之後每張都要先翻面才能評分
  await page.keyboard.press("3");
  await page.waitForTimeout(400);

  for (let i = 0; i < 15; i++) {
    if (await page.getByText("今日複習完成！").isVisible().catch(() => false)) break;
    await page.keyboard.press("Space");
    await page.waitForTimeout(250);
    await page.keyboard.press("3");
    await page.waitForTimeout(400);
  }
  await expect(page.getByText("今日複習完成！")).toBeVisible({ timeout: 5000 });
  console.log("· 複習一輪完成");
}

const written = [];
async function shot(page, name) {
  const file = path.join(OUT_DIR, `${name}.png`);
  await page.waitForTimeout(250);
  await page.screenshot({ path: file });
  written.push(`${name}.png`);
  console.log(`✓ ${path.relative(process.cwd(), file)}`);
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  await seedCaptures();

  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1400, height: 880 }, locale: "zh-TW" });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });

  await seedDeckAndCards(page);
  await runReview(page);

  // 影片瀏覽紀錄（擴充在 youtube.com 會 ping，這裡直接打 API）
  await page.evaluate(async (ids) => {
    for (const [videoId, title] of ids) {
      await fetch("/api/visit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoId, title }),
      });
    }
  }, [["jNQXAC9IVRw", "Me at the zoo — 西語學習示範影片"], ["dQw4w9WgXcQ", "日常西語對話練習"]]);

  for (const [name, url] of SHOTS) {
    await page.goto(`${BASE}${url}`, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
    // 確認頁面真的有內容才截圖（避免留下空白圖）
    if (name === "cards") await expect(page.getByText("desarrollar").first()).toBeVisible({ timeout: 8000 });
    if (name === "library") await expect(page.getByText(/Me at the zoo/).first()).toBeVisible({ timeout: 8000 });
    if (name === "stats") await expect(page.getByText(/複習/).first()).toBeVisible({ timeout: 8000 });
    await shot(page, name);
  }

  await browser.close();

  // 截圖清單（供 README 引用）
  writeFileSync(
    path.join(OUT_DIR, "index.json"),
    JSON.stringify({ generatedFrom: BASE, shots: written }, null, 2),
    "utf8",
  );

  if (errors.length > 0) {
    console.log(`\n⚠️ 頁面有 ${errors.length} 則 console 錯誤（僅供參考）：`);
    for (const e of errors.slice(0, 5)) console.log(`  ${e}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
