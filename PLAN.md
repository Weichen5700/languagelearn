# 外語學習平台 學習計畫

> 一個通用、可擴充的外語學習網站：計畫追蹤 / 單字卡 / API 串接翻譯 / 發音練習。
> 設計理念：**語言無關（language-agnostic）**，換語言只需改設定，不用改程式碼。

---

## 一、產品目標

1. **通用性**：同一套系統可學任意語言（英、日、韓、西、法、德…），語言只是「設定檔 + 語系代碼」。
2. **有計畫性**：學習計畫 / 課程進度 / 每日任務，避免漫無目的。
3. **可串接**：透過 API KEY 接入第三方翻譯 / 語音 / 字典服務，不把邏輯寫死。
4. **可練習**：單字卡（SRS 間隔複習）+ 發音練習（語音辨識 + TTS）+ 翻譯練習。
5. **可攜帶**：資料以開放格式（JSON / SQLite）儲存，可匯出匯入，不被綁架。

---

## 二、核心功能模組

| 模組 | 功能 | 优先級 |
|---|---|---|
| 計畫 Plan | 課程建立、每日任務、進度追蹤、學習曲線 | P0 |
| 單字卡 Flashcards | SRS（**FSRS 演算法**）、正反卡、cloze 卡、例句卡、deck 分組、tags | P0 |
| 翻譯 Translate | 文字翻譯、整句練習、對照顯示、**結果快取** | P0 |
| 發音 Pronunciation | TTS 播放（**音檔預抓快取**）、錄音比對、IPA 音標顯示 | P1 |
| 字典 Dictionary | 詞條查詢、詞性、例句、反查 | P1 |
| 統計 Stats | 熟練度、複習熱力圖、每日學習時長（**含 timeSpent**） | P1 |
| API 整合 | 翻譯 / TTS / ASR / 字典 服務切換、**請求快取降成本** | P0 |
| 設定 Settings | 語言對（**source/target 為使用者設定**）、API KEY 管理、主題、快捷鍵 | P0 |
| 測試 Testing | SRS / 快取 / provider 切換的**單元測試**、複習流程 E2E | P0 |

---

## 三、技術架構

### 3.1 技術棧選型

- **前端**：Next.js (App Router) + TypeScript + TailwindCSS
  - SSR 支援、SEO 友好、API Route 一站式。
- **狀態 / 資料**：Zustand（UI 狀態）+ Dexie.js（IndexedDB，離線優先）
- **後端 / 持久化**：SQLite（本地）→ 可選 PostgreSQL（多裝置同步）
- **認證**：NextAuth.js（本地帳號 + 可選 OAuth）
- **API 層**：統一 `services/` 介面，依設定切換 provider。
- **SRS 演算法**：**FSRS**（Free Spaced Repetition Scheduler，v4），比 SM-2 記憶模型更準、複習量約可減 30%；以純 TS 實作 + 單元測試先行。
- **測試**：Vitest（unit，SRS / 快取 / provider）+ Playwright（E2E 複習流程）。SRS 是純邏輯，採 **TDD** 先寫測試再實作。

### 3.2 目錄結構（預覽）

> **MVP 先用單一 Next.js app + `lib/` 目錄**（YAGNI，避免 Turborepo monorepo 過度設計拖慢出貨）。
> 等真有跨 app 共用需求再拆 `packages/`。

```
外語學習嘗試/
├── apps/web/                 # Next.js 前端 + 後端路由
│   ├── app/
│   │   ├── (learn)/plan/     # 學習計畫
│   │   ├── (learn)/cards/    # 單字卡
│   │   ├── (learn)/translate/
│   │   ├── (learn)/pronunciation/
│   │   └── api/              # 後端路由（translate / tts 代理）
│   ├── components/
│   ├── lib/
│   │   ├── srs/              # FSRS 演算法 + 測試
│   │   ├── schemas/          # Zod schema（單字卡、計畫…）
│   │   ├── i18n/             # UI 多語 + 語言設定檔
│   │   ├── cache/            # 翻譯 / TTS 結果快取
│   │   └── audio/            # 錄音 / 比對 / 預抓快取
│   └── services/             # 第三方 API 封裝（translate / tts / asr / dict）
└── data/                     # 範例資料 / 語言包
    └── languages/
        ├── es.yaml           # 西文（預設）
        ├── en.yaml
        └── ...
```

### 3.3 語言設定檔範例（`data/languages/en.yaml`）

```yaml
code: en
name: English
nativeName: English
tts:
  voice: en-US-Standard-A
  provider: google   # google | azure | openai | browser
asr:
  provider: browser  # Web Speech API 預設
ipa: true
direction: ltr
dictionary:
  provider: freedict  # 可換 provider
# translate.source / target 不放這裡，改由使用者設定（支援「從英文學西文」等情境）
```

> **重點**：換語言 = 換 yaml，程式碼不動。
> **翻譯方向**由使用者設定，**不寫死在語言包**，方便從不同母語學同一外語。

---

## 四、API 串接設計

統一介面，依 `.env` / 設定切換 provider，避免 vendor lock-in。

### 4.1 Provider 介面

```ts
// services/translate.ts
export interface TranslateProvider {
  name: string;
  translate(text: string, from: LangCode, to: LangCode): Promise<string>;
}
```

### 4.2 預計支援服務

| 類型 | Provider 選項（可任選 / 混搭） |
|---|---|
| 翻譯 | Google Translate、DeepL、OpenAI、Azure Translator、LibreTranslate（免費） |
| TTS 發音 | Google TTS、Azure Speech、OpenAI TTS、ElevenLabs、瀏覽器原生 |
| ASR 語音辨識 | Web Speech API、Whisper (OpenAI)、Azure Speech |
| 字典 | Free Dictionary API、Wordnik、Jisho（日）、本地詞庫 |

### 4.3 API KEY 管理

- 存於 `.env.local`（開發）/ 加密後存 DB（使用者設定）。
  - **本機設定檔加密**：用 Web Crypto API（AES-GCM，key 由使用者主密碼衍生 PBKDF2）；IndexedDB 預設不加密，必須顯式加密後才存 KEY。
  - **或**只把 KEY 存後端（Next.js server-side），前端透過 cookie session 識別使用者，KEY 永不下發。推薦後端託管。
- 後端 API Route 代理請求，**KEY 永不暴露到前端**。
- 支援「無 KEY 模式」：降級使用免費 provider / 瀏覽器原生功能。

### 4.4 成本控制（重要）

第三方 API 要錢，必須**避免重複請求**：

- **翻譯快取**：以 `hash(text + from + to)` 為 key 存 SQLite / IndexedDB，重複字直接回 hit。
- **TTS 音檔快取**：以 `hash(voice + text)` 為 key 存 **Blob 到 IndexedDB**，複習同一張卡不重打 API。
- **批次請求**：新增整批單字時，一次 batch translate（Google 支援多字一次）。
- **配額監控**：後端記錄每日 API 用量，超過 threshold 警告並自動降級。

---

## 五、資料模型

```ts
Card {
  id, userId?, deckId, lang, cardType,     // basic | cloze | ipa | image
  front, back, ipa?, example?, clozeText?,
  media: { audioId?, imageId? },            // 發音練習錄音 / 圖片
  tags[],
  srs: { stability, difficulty, due, reps, lapses, lastReview, state },  // FSRS 欄位
  createdAt, updatedAt
}

Deck { id, userId?, name, lang, description, cardCount }

Plan {
  id, userId?, title, lang, goal, startDate, endDate,
  tasks: [{ day, cardIds[], notes }],
  progress: number
}

LogEntry {   // 複習紀錄
  id, cardId, userId?, action,           // review | learn | cram
  rating,                                 // FSRS 0–4 或 SM-2 風格
  timeSpentMs,                            // 看這張卡花多久（統計用）
  ts
}

AudioBlob { id, voice, text, blob, createdAt }   // TTS 預抓快取表
TranslateCache { hash, text, from, to, result, createdAt }
```

---

## 六、開發階段（MVP → 完整）

### Phase 0：環境與骨架（0.5 週）
- 初始化 Next.js + Tailwind + TypeScript（**單 app，先不拆 monorepo**）。
- 建立 `data/languages/*.yaml` + 語言包載入邏輯。
- 搭 `lib/` 與 `services/` 骨架、Vitest 測試環境。

### Phase 1：單字卡 MVP（1 週）⭐ 先做這個
- **TDD**：先寫 FSRS 演算法單元測試，再實作（`lib/srs/`）。
- 卡片 CRUD、deck 分組、cloze 卡、SRS（FSRS v4）、複習介面（翻卡、評分 0–4）。
- **複習 UX 細節**（決定體驗成敗）：
  - 新卡學習步驟：1min → 10min（兩步內未評 Again 不算學會）。
  - 新卡 / 日上限 + 複習 / 日上限（使用者可調，預設 20 新卡）。
  - 複習佇列：**新卡與複習卡交錯**，避免一連串新卡疲勞。
  - 全鍵盤操作：Space 翻卡、1–5 評分、`u` undo。
- IndexedDB 離線儲存、匯入匯出 JSON。
- E2E 測試（Playwright）：新增卡 → 複習 → 評分 → due 更新。

### Phase 2：翻譯 + TTS（1 週）
- 翻譯 provider 介面 + LibreTranslate（免費）+ Google Translate（有 KEY 時）。
- **翻譯結果快取**（`TranslateCache` 表，hash key）。
- TTS 播放按鈕：瀏覽器原生 + Google TTS。
- **TTS 音檔預抓**：卡片建立 / 首次複習時把音檔抓回存 `AudioBlob`，之後離線可播。

### Phase 3：計畫模組（1 週）
- 課程 / 每日任務 / 進度條 / 提醒。

### Phase 4：發音練習（1 週）
- 錄音（MediaRecorder）+ ASR 比對 + 音標顯示。
- **比對方法（分階段）**：
  - MVP：瀏覽器 Web Speech ASR 轉錄 → 字串相似度（Levenshtein 正規化）。
  - 進階：MFCC + DTW（音訊特徵比對，更準但較重）。
  - 可選：Azure Pronunciation Assessment（要 KEY，評分最細）。

### Phase 5：統計 + 同步 + 帳號（1.5 週）
- 熱力圖、熟練度圖表、可選雲端同步。

---

## 七、設計原則（重要）

1. **離線優先**：沒網路也能複習單字卡；API 只在需要時呼叫。
   - **TTS 音檔預抓**：首次複習時抓回存 IndexedDB，之後離線可播（解決「離線 vs 雲端 TTS」衝突）。
2. **隱私**：API KEY 走後端代理，使用者資料可選純本地。
3. **可擴充**：每個 provider 一個檔案，新增語言 / 服務不改核心。
4. **開放資料**：卡片、計畫皆可 JSON 匯出匯入。
5. **鍵盤流**：複習時全鍵盤操作（Space 翻卡、1–5 評分、`u` undo）。
6. **測試先行**：SRS 演算法、快取、provider 切換用單元測試；複習流程用 E2E。

---

## 八、已確認決策

| 項目 | 決定 |
|---|---|
| 目標語言 | **西班牙文 Español**（預設語言包 `data/languages/es.yaml`，源語 zh → 目標 es） |
| 技術棧 | **Next.js + TypeScript**（App Router，全端一體） |
| API 服務 | **Google Cloud**：Translate + Text-to-Speech（需 API KEY / Service Account） |
| 無 KEY 降級 | LibreTranslate（翻譯）+ 瀏覽器原生 SpeechSynthesis（TTS） |

### Google Cloud 接入重點
- 啟用 API：Cloud Translation API、Text-to-Speech API。
- 認證：開發用 `GOOGLE_API_KEY`（`.env.local`）；正式可改 Service Account JSON。
- 後端 `app/api/translate/route.ts`、`app/api/tts/route.ts` 代理，KEY 不進前端。
- **KEY 儲存建議**：後端環境變數託管（最安全）；若需多使用者各帶 KEY，則後端 DB 加密存（AES-GCM），不把 KEY 下發前端。
- TTS 語音代碼預設 `es-ES-Standard-A`（女聲）/ `es-ES-Standard-B`（男聲）。

### 西班牙文語言包（`data/languages/es.yaml`）

```yaml
code: es
name: Spanish
nativeName: Español
tts:
  voice: es-ES-Standard-A
  provider: google
asr:
  provider: browser
ipa: true           # 西文拼寫規則相對規律，IPA 可選用
dictionary:
  provider: freedict   # Free Dictionary API 支援 es
direction: ltr
# translate.source / target 由使用者設定，不寫死
```

---

## 九、下一步

計畫已定案，可隨時開始 **Phase 0：初始化專案骨架**：
1. `create-next-app` + Tailwind + TypeScript（單 app，先不拆 monorepo）。
2. 建立 `data/languages/es.yaml` + 語言包載入邏輯。
3. 搭 `services/`（translate / tts）provider 介面 + Google 實作 + 免費降級。
4. 搭 `lib/cache/`（翻譯 / TTS 結果快取）。
5. 跑通首頁 + 翻譯 API route（驗證 KEY 串通 + 快取命中）。

只要說一聲「開始」我就動工。

---

## 十、實作進度（已全部完成 ✅）

| Phase | 內容 | 狀態 |
|---|---|---|
| 0 | 骨架：Next.js + TS + Tailwind + 語言包 + services + cache + FSRS TDD | ✅ |
| 1 | 單字卡 MVP：FSRS 複習 + Dexie 離線 + 鍵盤流 + 匯入匯出 | ✅ |
| 2 | 翻譯 + TTS + 字典整合進卡片（音檔預抓快取） | ✅ |
| 3 | 計畫模組：每日任務 + 進度條 + 自動分配 + 今日複習 | ✅ |
| 4 | 發音練習：錄音 + Web Speech ASR + Levenshtein 評分 | ✅ |
| 5 | 統計：熱力圖 + 熟練度分布 + 每日時長 + 本機設定檔 + 備份 | ✅ |

**測試**：88 個單元測試全通過（FSRS / 佇列 / TTS 快取 / 計畫進度 / 相似度 / 統計聚合 / 本機 Store 契約）。

**整備**：ESLint 0 error／0 warning、`tsc --noEmit` 無錯誤、`next build` 18/18 頁面、
GitHub Actions CI（lint / typecheck / test / build / e2e）、`LICENSE`、
`.env.local.example` 入庫（新 clone 可直接複製）。

### 雲端同步與帳號（未來工作）

Phase 5 採 **本機設定檔**（`lib/store/profile.ts`，純 localStorage）實現多設定檔，無需後端帳號。
雲端同步的完整路徑（未實作，規劃於此）：

1. **後端**：NextAuth.js（本地帳號 + Google OAuth）+ PostgreSQL（取代 IndexedDB 為主儲存）。
2. **同步策略**：Dexie 仍為離線快取；背景 sync 把 logEntries / cards / plans 推上雲端，衝突以 `updatedAt` 取較新者。
3. **API KEY 託管**：使用者各帶 KEY 存後端 DB（AES-GCM 加密），不暴露前端。
4. **現況替代**：JSON 匯出/匯入（`/stats` 與 `/cards` 皆可）作為可攜帶性的 MVP 形式。