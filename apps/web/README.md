# 外語學習平台（web）

通用外語學習網站：計畫 / 單字卡（FSRS）/ 翻譯 / 發音練習 + **沉浸式擷取模組**（Chrome 擴充點 YT 字幕帶語境回本站）。
整體設計見根目錄 `PLAN.md` 與 `IMMERSION.md`。

## 環境設定

### 1. Google Cloud API KEY（翻譯 + TTS）

無 KEY 也能跑（降級：翻譯走 LibreTranslate 公共端點、TTS 用瀏覽器語音），但翻譯品質／語音品質較差、公共端點易限流。建議設：

1. 到 [Google Cloud Console](https://console.cloud.google.com/) 建專案 → 啟用 **Cloud Translation API** 與 **Text-to-Speech API**。
2. 「API 與服務 → 憑證 → 建立憑證 → API 金鑰」，複製金鑰。
3. 在本目錄建立 `.env.local`：
   ```bash
   cp .env.local.example .env.local
   # 編輯 .env.local，填入：
   # GOOGLE_API_KEY=你的金鑰
   ```
4. KEY 只在後端讀取（`app/api/*/route.ts` 代理），**永不暴露到前端**。
5. （可選）自架 LibreTranslate：設 `LIBRETRANSLATE_ENDPOINT`，翻譯 provider 會改用它。

> 費用控制：翻譯結果與 TTS 音檔皆有快取（IndexedDB），同字同音不重打 API。

### 2. 安裝與啟動

```bash
cd apps/web
npm install        # 首次
npm run dev        # http://localhost:3000
```

### 3. 沉浸式擷取：載入 Chrome 擴充

見 `apps/extension/README.md`。簡言之：
1. `chrome://extensions` → 開「開發人員模式」→ 載入未打包 `apps/extension`。
2. 點擴充圖示設本機網址（`http://localhost:3000`）、字幕語、翻譯母語。
3. 開有外語字幕的 YouTube 影片 → 點字幕單字 → 本站右上徽章 `🎬 同步中 · +N`。

## 測試

```bash
npm test           # 68 個單元測試（FSRS / capture / merge / 統計）
npm run check      # tsc --noEmit
npm run build      # 正式建置
npm run e2e         # Playwright E2E（複習流程）
```

### API 煙測（站啟動後）

```bash
# 擷取一筆（模擬擴充點字幕）
curl -X POST http://localhost:3000/api/capture -H 'Content-Type: application/json' \
  -d '{"word":"gato","sentence":"El gato duerme.","videoId":"vid1","startSec":12,"source":"youtube","lang":"es","translation":"貓"}'
# 看暫存
curl http://localhost:3000/api/capture
# SSE 連線
curl -N http://localhost:3000/api/capture/stream
```

## 沉浸式模組測試流程（由低到高風險）

1. **單元**：`npm test` 全過。
2. **API**：上方煙測 → POST 回 `duplicate:false`、重複回 `duplicate:true`、GET 列出、PATCH 標 imported、SSE 收 `ready`。
3. **擴充**：載入後開 YT 影片點字幕 → 浮層顯示譯文 → 本站徽章 +1。
4. **複習**：`/cards` 出現「沉浸（影片）· es」deck；`/cards/review` 點「重看這句」→ 截圖 + 可調速 YouTube 播放器；卡上發音有 TTS 語速鈕；`/stats` 顯示沉浸占比。

## 常見卡點

- **無 KEY**：翻譯可能空（LibreTranslate 限流），但擷取仍存；TTS 用瀏覽器語音。設 `GOOGLE_API_KEY` 最完整。
- **字幕語不符**：影片字幕語 ≠ 擴充設定 → 譯文方向錯，在 popup 改「字幕語」。
- **截圖空白**：影片還沒載好（videoWidth=0），先播一下再點字。
- **徽章沒 +1**：網站分頁要開著（SSE 才連線）；沒開時進離線暫存，開站補傳。

## 語速控制

外語學習常需調速，兩處皆可調且持久化：
- **TTS**：`<TtsSpeedControl>`（0.5×–1.75×），播放端套用，不改音檔、不分裂快取。位於首頁、複習、發音頁。
- **YouTube 重看**：`<YouTubePlayer>` 用 IFrame API `setPlaybackRate`，比純 iframe 多語速鈕。

## 技術棧

Next.js (App Router) + TypeScript + Tailwind + Zustand + Dexie（IndexedDB，離線優先）+ Vitest + Playwright。
SRS 採 FSRS-4.5。第三方 API 走後端代理保護 KEY。