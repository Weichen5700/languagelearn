/* 外語沉浸擷取 — content script
 *
 * 單一固定右側側欄：字幕記錄 + 速度控制 + 存情境，不再三塊浮層。
 * 點擊單字 → 開啟擷取對話框，顯示完整字典資訊（詞性/釋義/例句/譯文/TTS/重播）+ API 狀態。
 * 離線時暫存 chrome.storage.local，定時重試補傳（離線優先）。
 */

(async function () {
  "use strict";

  // ---- 設定 ----
  const DEFAULTS = {
    baseUrl: "http://localhost:3000",
    targetLang: "es",
    sourceLang: "zh",
    enabled: true,
    listeningMode: false,
    sidebarOpen: true,
    ytRate: 1,
    hoverPreview: true,
  };
  let cfg = { ...DEFAULTS, ...(await chrome.storage.sync.get(DEFAULTS)) };

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync") return;
    for (const k of Object.keys(changes)) cfg[k] = changes[k].newValue;
    applyListeningMode();
    applySidebarVisibility();
    applyPlaybackRate();
  });

  // ---- 離線暫存與補傳 ----
  const BUFFER_KEY = "captureBuffer";
  const MAX_BUFFER = 500;

  async function readBuffer() {
    return (await chrome.storage.local.get(BUFFER_KEY))[BUFFER_KEY] ?? [];
  }
  async function writeBuffer(buf) {
    await chrome.storage.local.set({ [BUFFER_KEY]: buf.slice(-MAX_BUFFER) });
  }
  async function enqueueCapture(payload) {
    const buf = await readBuffer();
    buf.push(payload);
    await writeBuffer(buf);
    void flushBuffer();
  }
  async function flushBuffer() {
    const buf = await readBuffer();
    if (!buf.length) return;
    const remaining = [];
    for (const p of buf) {
      const ok = await postCapture(p, true);
      if (!ok) remaining.push(p);
    }
    await writeBuffer(remaining);
    updateConnStatus(remaining.length === 0 && buf.length > 0 ? "ok" : null);
  }
  void flushBuffer();
  setInterval(flushBuffer, 60000);

  // ---- API 呼叫 ----
  async function postJSON(path, body) {
    const res = await fetch(`${cfg.baseUrl}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      let detail = `${res.status}`;
      try {
        const d = await res.json();
        if (d?.error) detail += ` · ${typeof d.error === "string" ? d.error : JSON.stringify(d.error)}`;
      } catch {}
      throw new Error(`${path} ${detail}`);
    }
    return res.json();
  }

  async function translateWord(word) {
    try {
      const r = await postJSON("/api/translate", {
        text: word,
        from: cfg.targetLang,
        to: cfg.sourceLang,
      });
      return { ok: true, result: r.result ?? "" };
    } catch (e) { return { ok: false, error: String(e) }; }
  }

  async function lookupWord(word) {
    try {
      const r = await postJSON("/api/dictionary", { word, lang: cfg.targetLang });
      return { ok: true, entry: r.entry ?? null };
    } catch (e) { return { ok: false, error: String(e) }; }
  }

  /** postCapture：擷取 + 翻譯 + 字典一起送；quiet=true 代表補傳不重查 */
  async function postCapture(payload, quiet = false) {
    try {
      let translation = payload.translation;
      let dictionaryEntry = payload.dictionaryEntry;
      if (!quiet) {
        if (translation === undefined) {
          const t = await translateWord(payload.word);
          translation = t.result;
        }
        if (dictionaryEntry === undefined) {
          const d = await lookupWord(payload.word);
          dictionaryEntry = d.entry;
        }
      }
      await postJSON("/api/capture", {
        word: payload.word,
        sentence: payload.sentence,
        videoId: payload.videoId,
        startSec: payload.startSec,
        source: "youtube",
        lang: cfg.targetLang,
        translation,
        dictionaryEntry,
        screenshot: payload.screenshot,
      });
      return true;
    } catch { return false; }
  }

  // ---- 連線狀態 ----
  let connStatus = "idle"; // idle | ok | err
  async function pingConn() {
    try {
      const res = await fetch(`${cfg.baseUrl}/api/languages`, { method: "GET" });
      connStatus = res.ok ? "ok" : "err";
    } catch { connStatus = "err"; }
    updateConnStatus();
  }
  void pingConn();
  setInterval(pingConn, 60000);

  // ---- YouTube 字幕 DOM 處理 ----
  const WRAP_ATTR = "data-im-wrap";

  function getVideoId() {
    const u = new URL(location.href);
    if (u.pathname === "/watch") return u.searchParams.get("v") ?? "";
    const m = u.pathname.match(/\/embed\/([^/?#]+)/);
    return m ? m[1] : "";
  }

  // 是否在播放頁（/watch 或 /embed）；首頁及其他頁面不啟動字幕觀察／側欄，
  // 避免 MutationObserver 觀察整個 document.body 而與 YouTube SPA 形成回饋迴圈。
  function isWatchPage() {
    const p = location.pathname;
    return p === "/watch" || /^\/embed\//.test(p);
  }

  // ---- 瀏覽紀錄回報 ----
  let lastVisitId = "";
  async function pingVisit() {
    const vid = getVideoId();
    if (!vid || vid === lastVisitId) return;
    lastVisitId = vid;
    // 換影片：清空字幕緩衝（時間軸重置），避免不同影片字幕混在同一條時間軸
    recentLines.length = 0;
    lastRenderedKey = "";
    try {
      await postJSON("/api/visit", {
        videoId: vid,
        title: document.title.replace(/\s*-\s*YouTube\s*$/, "").trim() || undefined,
        source: "youtube",
      });
    } catch { /* 離線：不暫存 */ }
  }
  document.addEventListener("yt-navigate-finish", () => {
    void pingVisit();
    setupCaptionObserver();
    applySidebarVisibility();
  });
  let lastHref = location.href;
  setInterval(() => {
    if (location.href !== lastHref) {
      lastHref = location.href;
      void pingVisit();
      setupCaptionObserver();
      applySidebarVisibility();
    }
  }, 3000);

  function getCurrentTime() {
    const v = document.querySelector("video");
    return v ? Math.max(0, Math.floor(v.currentTime)) : 0;
  }

  /** 當前畫面上顯示的字幕文字（取自 YouTube 字幕 DOM；空字串若無字幕）。 */
  function currentCaptionText() {
    const segs = document.querySelectorAll(".ytp-caption-segment");
    if (!segs.length) return "";
    return Array.from(segs).map((s) => s.textContent ?? "").join(" ").replace(/\s+/g, " ").trim();
  }

  /** 把字幕文字分行（依 canvas 寬度）並在底部繪上半透明底條 + 白字。 */
  function drawCaptionOnCanvas(ctx, text, canvasW, canvasH) {
    if (!text) return;
    const maxW = canvasW - 16;
    const fontSize = Math.max(13, Math.round(canvasH * 0.06));
    ctx.font = `600 ${fontSize}px "Segoe UI", system-ui, sans-serif`;
    ctx.textBaseline = "alphabetic";
    // 斷行
    const lines = [];
    for (const raw of text.split(/\s+/)) {
      if (!raw) continue;
      const test = lines.length ? lines[lines.length - 1] + " " + raw : raw;
      if (ctx.measureText(test).width > maxW && lines[lines.length - 1]) {
        lines.push(raw);
      } else {
        lines[lines.length - 1] = test;
      }
    }
    const lineH = Math.round(fontSize * 1.25);
    const blockH = lines.length * lineH + 10;
    const bottom = canvasH - 6;
    // 底條
    ctx.fillStyle = "rgba(0,0,0,0.62)";
    ctx.fillRect(4, bottom - blockH, canvasW - 8, blockH);
    // 文字
    ctx.fillStyle = "#fff";
    ctx.textAlign = "center";
    lines.forEach((ln, i) => {
      const y = bottom - 6 - (lines.length - 1 - i) * lineH;
      ctx.fillText(ln, canvasW / 2, y);
    });
    ctx.textAlign = "left";
  }

  function captureScreenshot() {
    const v = document.querySelector("video");
    if (!v || !v.videoWidth) return undefined;
    try {
      const canvas = document.createElement("canvas");
      const scale = Math.min(1, 480 / v.videoWidth);
      canvas.width = Math.round(v.videoWidth * scale);
      canvas.height = Math.round(v.videoHeight * scale);
      const ctx = canvas.getContext("2d");
      if (!ctx) return undefined;
      ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
      // 疊加當前字幕（drawImage 只取影格，不含 HTML 字幕覆蓋層）
      try { drawCaptionOnCanvas(ctx, currentCaptionText(), canvas.width, canvas.height); } catch {}
      return canvas.toDataURL("image/jpeg", 0.7);
    } catch { return undefined; }
  }

  // ---- 字幕緩衝：時間軸排序 + 跳轉安全（自由跳轉重播不重複） ----
  // recentLines 依 startSec 遞增排序，側欄即一條真實時間軸。
  // 不限制單調前進，允許自由跳轉；靠「時間鄰近（10s）+ 文字重疊」去重，
  // 跳回已看過的句子只會 no-op，不會重新插入。
  const recentLines = [];   // {text, startSec}  依 startSec 遞增
  const MAX_LINES = 120;        // 緩衝上限（句數）；超過從時間軸最舊者 shift
  const MERGE_WINDOW_SEC = 10;  // 同句合併／去重判斷的時間鄰近窗
  const NOW_PLAY_GAP_SEC = 12;  // now-startSec 超過此值則不高亮（段落空隙）
  // 最長「a 的尾段 == b 的開頭」重疊長度
  function overlapLen(a, b) {
    const max = Math.min(a.length, b.length);
    for (let n = max; n > 0; n--) {
      if (a.endsWith(b.slice(0, n))) return n;
    }
    return 0;
  }
  // 找 now 時刻的 active 句：startSec <= now 且在合併窗內最接近者
  function findActiveIdx(now) {
    for (let i = recentLines.length - 1; i >= 0; i--) {
      const s = recentLines[i].startSec;
      if (s > now) continue;            // 未來句不算
      if (now - s <= MERGE_WINDOW_SEC) return i;  // 時間鄰近 → 命中
      break;                            // 已排序，更早者只會更遠
    }
    return -1;
  }
  // 依 startSec 插入正確位置（保持時間軸遞增）
  function insertLine(line) {
    let lo = 0, hi = recentLines.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (recentLines[mid].startSec <= line.startSec) lo = mid + 1; else hi = mid; }
    recentLines.splice(lo, 0, line);
    if (recentLines.length > MAX_LINES) recentLines.shift();
  }
  function pushRecentLine(text) {
    const t = (text || "").trim();
    if (!t) return;
    const now = getCurrentTime();
    const ai = findActiveIdx(now);
    if (ai >= 0) {
      const active = recentLines[ai];
      if (t === active.text) { return; }                                  // 同句重顯：no-op
      if (active.text.startsWith(t)) { return; }                          // 倒帶重播的漸進前綴：保留已存完整句
      if (t.startsWith(active.text) && t.length > active.text.length) {   // 前綴延伸：合併成完整句
        active.text = t; return;
      }
      const ov = overlapLen(active.text, t);                              // 尾首重疊（滾動視窗）：合併
      const shorter = Math.min(active.text.length, t.length);
      if (ov >= 3 && ov >= shorter * 0.4) {
        const merged = (active.text + t.slice(ov)).trim();
        if (merged && merged !== active.text) { active.text = merged; return; }
      }
    }
    // 否則視為新句，依 startSec 插入正確位置
    insertLine({ text: t, startSec: now });
  }
  void pingVisit();  // 初始瀏覽回報（移到緩衝狀態宣告之後，避免換影片重置時誤觸 TDZ）

  let processingSegments = false;  // 重入保護：避免觀察到的 DOM 變動再次觸發處理形成迴圈
  function processAllSegments() {
    if (processingSegments) return;
    processingSegments = true;
    try {
      _processAllSegments();
    } finally {
      processingSegments = false;
    }
  }
  function _processAllSegments() {
    if (!cfg.enabled) {
      document.querySelectorAll(`.ytp-caption-segment[${WRAP_ATTR}]`).forEach(unwrapWords);
      return;
    }
    document.querySelectorAll(".ytp-caption-segment").forEach((seg) => {
      wrapWords(seg);
    });
    // 把當前所有字幕段拼成一行再入緩衝（避免多段拆開成重複句）
    const segs = document.querySelectorAll(".ytp-caption-segment");
    if (segs.length) {
      const full = Array.from(segs).map((s) => s.textContent ?? "").join(" ").replace(/\s+/g, " ").trim();
      pushRecentLine(full);
    }
    renderSidebar();
  }

  // 存情境：取最後 N 句
  async function saveScenario(n = 5) {
    if (!cfg.enabled) return;
    if (recentLines.length === 0) {
      showFloating("⚠ 尚無可擷取的字幕句（先讓影片播一下）");
      return;
    }
    const lines = recentLines.slice(-n);
    const payload = {
      word: `情境`,
      sentence: lines[0]?.text ?? "",
      videoId: getVideoId(),
      startSec: lines[0]?.startSec ?? getCurrentTime(),
      screenshot: captureScreenshot(),
      scenario: lines,
    };
    showFloating("⏳ 存情境中…");
    const translation = "";
    const ok = await postCapture({ ...payload, translation, dictionaryEntry: null });
    if (!ok) await enqueueCapture({ ...payload, translation, dictionaryEntry: null });
    showFloating(ok ? `🎬 已存情境（${lines.length} 句）` : "已暫存（離線）");
  }

  // ---- 置中浮層提示 ----
  let floating = null;
  function showFloating(text) {
    if (!floating) {
      floating = document.createElement("div");
      floating.className = "im-floating";
      document.body.appendChild(floating);
    }
    floating.textContent = text;
    floating.classList.add("show");
    clearTimeout(showFloating._t);
    showFloating._t = setTimeout(hideFloating, 2500);
  }
  function hideFloating() {
    if (floating) floating.classList.remove("show");
  }

  function wrapWords(segment) {
    if (segment.getAttribute(WRAP_ATTR)) return;
    const text = segment.textContent ?? "";
    if (!text.trim()) return;
    const frag = document.createDocumentFragment();
    const parts = text.split(/(\s+)/);
    for (const part of parts) {
      if (part === "") continue;
      if (/^\s+$/.test(part)) {
        frag.appendChild(document.createTextNode(part));
      } else {
        const span = document.createElement("span");
        span.className = "im-word";
        span.textContent = part;
        span.dataset.word = part;
        frag.appendChild(span);
        frag.appendChild(document.createTextNode(""));
      }
    }
    segment.textContent = "";
    segment.appendChild(frag);
    segment.setAttribute(WRAP_ATTR, "1");
  }

  function unwrapWords(segment) {
    if (!segment.getAttribute(WRAP_ATTR)) return;
    segment.textContent = segment.textContent ?? "";
    segment.removeAttribute(WRAP_ATTR);
  }

  // ---- 字幕點擊 ----
  async function onCaptionClick(ev) {
    if (!cfg.enabled) return;
    const wordEl = ev.target.closest(".im-word");
    if (!wordEl || wordEl.closest(".im-sb-line")) return; // 側欄內自處理
    ev.preventDefault();
    ev.stopPropagation();
    const word = cleanWord(wordEl.dataset.word ?? wordEl.textContent ?? "");
    if (!word) return;
    const segment = wordEl.closest(".ytp-caption-segment");
    const sentence = (segment?.textContent ?? "").trim();
    await captureWord(word, sentence, getCurrentTime(), wordEl);
  }

  function cleanWord(w) {
    return w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
  }

  // ---- Listening Mode ----
  function applyListeningMode() {
    document.documentElement.classList.toggle("im-listening", !!cfg.listeningMode && cfg.enabled);
  }
  applyListeningMode();

  // ============================================================
  // 統一右側側欄
  // ============================================================
  let sidebar = null;
  let sbBody = null;
  let sbSpeedRow = null;
  let sbConnEl = null;
  let sbVisible = false;
  let lastRenderedKey = "";
  let sbStickToBottom = true;  // 自動追蹤「現在播放句」（貼著 now-playing 捲動）

  function buildSidebar() {
    if (sidebar) return;
    sidebar = document.createElement("div");
    sidebar.id = "im-sidebar";
    sidebar.className = "im-sidebar";
    sidebar.innerHTML = `
      <div class="im-sidebar-grip" data-act="toggle" title="展開/收合 (P)">◀</div>
      <div class="im-sb-head">
        <span class="im-sb-title">📝 沉浸擷取</span>
        <span class="im-sb-actions">
          <button type="button" class="im-sb-btn" data-act="latest" title="跳回目前播放句" hidden>↓ 目前</button>
          <button type="button" class="im-sb-btn" data-act="replay" title="重播最後一句">↺</button>
          <button type="button" class="im-sb-btn" data-act="toggle" title="收合側欄 (P)">▶</button>
        </span>
      </div>
      <div class="im-sb-speed"></div>
      <div class="im-sb-body"></div>
      <div class="im-sb-foot">
        <button type="button" class="im-sb-scenario" data-act="scenario">🎬 存情境 (Q)</button>
        <div class="im-sb-conn idle"><span class="dot"></span><span class="txt">連線：檢測中…</span></div>
      </div>
    `;
    document.body.appendChild(sidebar);
    sbBody = sidebar.querySelector(".im-sb-body");
    sbSpeedRow = sidebar.querySelector(".im-sb-speed");
    sbConnEl = sidebar.querySelector(".im-sb-conn");

    // 捲動追蹤：貼底時自動隨新句捲動；使用者往上拖曳瀏覽歷史時暫停追蹤，
    // 並顯示「↓ 最新」按鈕，點擊或拖回底部即恢復自動追蹤。
    const latestBtn = sidebar.querySelector('[data-act="latest"]');
    sbBody.addEventListener("scroll", () => {
      // 使用者拖離 now-playing 句 → 暫停追蹤並顯示「↓ 目前」；拖回該句即恢復
      sbStickToBottom = activeInView();
      if (latestBtn) latestBtn.hidden = sbStickToBottom;
    }, { passive: true });

    sidebar.addEventListener("click", (e) => {
      const act = e.target.closest("[data-act]")?.dataset.act;
      if (act === "toggle") { e.stopPropagation(); setSidebarOpen(!cfg.sidebarOpen); return; }
      if (act === "latest") {
        e.stopPropagation();
        sbStickToBottom = true;
        const el = activeLineEl();
        if (el) el.scrollIntoView({ block: "center" });
        const b = sidebar.querySelector('[data-act="latest"]'); if (b) b.hidden = true;
        return;
      }
      if (act === "replay") {
        e.stopPropagation();
        const last = recentLines[recentLines.length - 1];
        if (last) seekTo(last.startSec);
        return;
      }
      if (act === "scenario") { e.stopPropagation(); void saveScenario(); return; }
      // 字幕行內：單字點擊 / 跳轉
      const wordEl = e.target.closest(".im-word");
      if (wordEl) {
        e.preventDefault(); e.stopPropagation();
        handleWordClick(wordEl); return;
      }
      const seekEl = e.target.closest('[data-act="seek"]');
      if (seekEl) {
        e.preventDefault(); e.stopPropagation();
        const lineEl = seekEl.closest(".im-sb-line");
        const start = lineEl ? Number(lineEl.dataset.start) : NaN;
        if (!Number.isNaN(start)) seekTo(start);
      }
    });

    buildSpeedRow();
  }

  function setSidebarOpen(open) {
    cfg.sidebarOpen = open;
    void chrome.storage.sync.set({ sidebarOpen: open });
    applySidebarVisibility();
  }

  function applySidebarVisibility() {
    if (!cfg.enabled || !isWatchPage()) { if (sidebar) sidebar.style.display = "none"; sbVisible = false; return; }
    buildSidebar();
    sidebar.style.display = "flex";
    sidebar.classList.toggle("collapsed", !cfg.sidebarOpen);
    sbVisible = cfg.sidebarOpen;
    // 更新摺疊指示
    const grip = sidebar.querySelector(".im-sidebar-grip");
    const headBtn = sidebar.querySelector('.im-sb-actions [data-act="toggle"]');
    if (grip) { grip.textContent = cfg.sidebarOpen ? "▶" : "◀"; grip.title = cfg.sidebarOpen ? "收合側欄 (P)" : "展開側欄 (P)"; }
    if (headBtn) headBtn.textContent = cfg.sidebarOpen ? "▶" : "◀";
    sbStickToBottom = true;  // 展開時貼回最新句
    renderSidebar();
  }

  // ---- 速度控制（嵌入側欄） ----
  const RATES = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
  function buildSpeedRow() {
    if (!sbSpeedRow) return;
    sbSpeedRow.innerHTML =
      `<span class="im-sb-speed-label">速度</span>` +
      RATES.map((r) =>
        `<button type="button" class="im-speed-btn" data-rate="${r}">${r}×</button>`
      ).join("");
    sbSpeedRow.addEventListener("click", (e) => {
      const btn = e.target.closest(".im-speed-btn");
      if (!btn) return;
      e.stopPropagation();
      const r = Number(btn.dataset.rate);
      cfg.ytRate = r;
      void chrome.storage.sync.set({ ytRate: r });
      applyPlaybackRate();
    });
    updateSpeedBtns();
  }

  function applyPlaybackRate() {
    const v = document.querySelector("video");
    if (!v) return;
    const rate = cfg.ytRate ?? 1;
    if (v.playbackRate !== rate) v.playbackRate = rate;
    updateSpeedBtns();
  }

  function updateSpeedBtns() {
    if (!sbSpeedRow) return;
    const cur = cfg.ytRate ?? 1;
    sbSpeedRow.querySelectorAll(".im-speed-btn").forEach((b) => {
      b.classList.toggle("active", Number(b.dataset.rate) === cur);
    });
  }

  // 影片元素晚出現時輪詢套用速率（僅播放頁；首頁 hover 預覽影片不介入）
  let ratePoll = 0;
  function ensureRateWatch() {
    if (!isWatchPage()) { if (ratePoll) { clearInterval(ratePoll); ratePoll = 0; } return; }
    const v = document.querySelector("video");
    if (!v) return;
    applyPlaybackRate();
    if (!v.dataset.imRateWatch) {
      v.dataset.imRateWatch = "1";
      v.addEventListener("ratechange", () => {
        if (v.playbackRate !== cfg.ytRate) {
          cfg.ytRate = v.playbackRate;
          void chrome.storage.sync.set({ ytRate: v.playbackRate });
          updateSpeedBtns();
        }
      });
      // 隨播放進度更新「現在播放句」，跳轉(seeked)後立即對齊正確段落並置中
      v.addEventListener("timeupdate", updateActiveLine);
      v.addEventListener("seeked", () => { sbStickToBottom = true; updateActiveLine(); const el = activeLineEl(); if (el) el.scrollIntoView({ block: "center" }); });
    }
    if (ratePoll) { clearInterval(ratePoll); ratePoll = 0; }
  }
  if (isWatchPage() && document.querySelector("video")) ensureRateWatch();
  else if (isWatchPage()) ratePoll = setInterval(() => { if (document.querySelector("video")) ensureRateWatch(); }, 1500);

  // ---- 連線狀態顯示 ----
  function updateConnStatus(force) {
    if (!sbConnEl) return;
    const s = force || connStatus;
    sbConnEl.classList.remove("ok", "err", "idle");
    sbConnEl.classList.add(s);
    const txt = sbConnEl.querySelector(".txt");
    if (txt) txt.textContent = s === "ok" ? "連線：正常" : s === "err" ? "連線：失敗（離線暫存）" : "連線：檢測中…";
  }

  // ---- 側欄字幕渲染（全部保留，可捲動瀏覽歷史） ----
  function renderSidebar() {
    if (!sidebar || !sbVisible) return;
    const lines = recentLines;   // 渲染全部緩衝句，不再只取最後 8 句
    if (!lines.length) {
      sbBody.innerHTML = `<div class="im-sb-empty">播放影片以顯示字幕…<br>點單字查詞典</div>`;
      lastRenderedKey = "";
      return;
    }
    const key = lines.map((l) => `${l.startSec}:${l.text}`).join("|");
    if (key === lastRenderedKey) { updateActiveLine(); return; }
    lastRenderedKey = key;
    // 換內容會重設 scrollTop：瀏覽歷史（未追蹤）時先記住捲動位置再還原
    const savedScroll = sbStickToBottom ? null : sbBody.scrollTop;

    const html = lines.map((l) => {
      const mmss = fmtSec(l.startSec);
      const words = wrapWordsHtml(l.text);
      return `<div class="im-sb-line" data-sentence="${esc(l.text)}" data-start="${l.startSec}">
        <button type="button" class="im-sb-replay" data-act="seek" title="跳回 ${mmss} 重播">↺</button>
        <span class="im-sb-time" data-act="seek" title="跳回 ${mmss}">${mmss}</span>
        <span class="im-sb-text">${words}</span>
      </div>`;
    }).join("");
    sbBody.innerHTML = html;
    if (savedScroll != null) sbBody.scrollTop = savedScroll;
    updateActiveLine();
  }

  // 依「當前播放時間」標示現在播放的句：startSec <= now 的最後一條，
  // 且 now - startSec <= NOW_PLAY_GAP_SEC 才高亮（段落空隙不高亮）。
  function activeLineIndex() {
    const now = getCurrentTime();
    const lines = recentLines;
    let idx = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startSec <= now) idx = i; else break;
    }
    if (idx >= 0 && now - lines[idx].startSec > NOW_PLAY_GAP_SEC) return -1;
    return idx;
  }
  function updateActiveLine() {
    if (!sidebar || !sbVisible || !sbBody) return;
    const idx = activeLineIndex();
    const els = sbBody.querySelectorAll(".im-sb-line");
    els.forEach((el, i) => el.classList.toggle("cur", i === idx));
    if (idx >= 0 && sbStickToBottom) {
      const el = els[idx];
      if (el) el.scrollIntoView({ block: "nearest" });
    }
  }
  function activeLineEl() { return sbBody?.querySelector(".im-sb-line.cur") ?? null; }
  function activeInView() {
    const el = activeLineEl(); if (!el || !sbBody) return false;
    const r = el.getBoundingClientRect(), br = sbBody.getBoundingClientRect();
    return r.top >= br.top - 2 && r.bottom <= br.bottom + 2;
  }

  function wrapWordsHtml(text) {
    const t = (text || "").trim();
    if (!t) return "";
    return t.split(/(\s+)/).map((part) => {
      if (!part) return "";
      if (/^\s+$/.test(part)) return esc(part);
      return `<span class="im-word" data-word="${esc(part)}">${esc(part)}</span>`;
    }).join("");
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  function fmtSec(s) {
    if (!s && s !== 0) return "--:--";
    const m = Math.floor(s / 60), sec = Math.floor(s % 60);
    return `${m}:${sec < 10 ? "0" : ""}${sec}`;
  }

  function seekTo(sec) {
    const v = document.querySelector("video");
    if (v && typeof sec === "number") { v.currentTime = Math.max(0, sec); v.play?.(); }
  }

  // ---- 片段循環（A-B loop）：只在 startSec ~ endSec 之間反覆播放 ----
  let clipLoop = null; // { start, end, video, onTime, onEnd, btn }
  function clipEndSec(start) {
    // 下一句的起點即為本句結尾；沒有下一句就用固定 6 秒窗
    let end = start + 6;
    for (const l of recentLines) {
      if (l.startSec > start) { end = l.startSec; break; }
    }
    // 避免過短或過長：限制 2~30 秒
    return Math.min(start + 30, Math.max(start + 2, end));
  }
  function stopClipLoop() {
    if (!clipLoop) return;
    try { clipLoop.video.removeEventListener("timeupdate", clipLoop.onTime); } catch {}
    try { clipLoop.video.removeEventListener("ended", clipLoop.onEnd); } catch {}
    if (clipLoop.btn) {
      clipLoop.btn.classList.remove("active");
      clipLoop.btn.textContent = "🔁 循環片段";
    }
    clipLoop = null;
  }
  function toggleClipLoop(start) {
    const v = document.querySelector("video");
    if (!v) return;
    const btn = captureDialog?.querySelector('[data-act="loop"]');
    if (clipLoop) { stopClipLoop(); return; } // 再按一次 → 停止
    const end = clipEndSec(start);
    const onTime = () => {
      if (!clipLoop) return;
      if (v.currentTime >= clipLoop.end || v.currentTime < clipLoop.start - 0.25) {
        try { v.currentTime = clipLoop.start; v.play?.(); } catch {}
      }
    };
    const onEnd = () => { if (clipLoop) { try { v.currentTime = clipLoop.start; v.play?.(); } catch {} } };
    clipLoop = { start, end, video: v, onTime, onEnd, btn };
    v.addEventListener("timeupdate", onTime);
    v.addEventListener("ended", onEnd);
    if (btn) { btn.classList.add("active"); btn.textContent = "⏹ 停止循環"; }
    try { v.currentTime = start; v.play?.(); } catch {}
  }

  function handleWordClick(wordEl) {
    const lineEl = wordEl.closest(".im-sb-line");
    const word = cleanWord(wordEl.dataset.word ?? wordEl.textContent ?? "");
    if (!word) return;
    const sentence = lineEl?.dataset.sentence ?? "";
    const startSec = lineEl ? Number(lineEl.dataset.start) : getCurrentTime();
    captureWord(word, sentence, startSec, wordEl);
  }

  // ============================================================
  // 擷取對話框：完整字典資訊 + API 狀態
  // ============================================================
  let captureDialog = null;

  function buildCaptureDialog() {
    if (captureDialog) return;
    captureDialog = document.createElement("div");
    captureDialog.id = "im-capture-dialog";
    captureDialog.className = "im-capture";
    captureDialog.innerHTML = `
      <div class="im-cap-card" role="dialog" aria-modal="true">
        <div class="im-cap-head">
          <span class="im-cap-title">📝 擷取到學習網站</span>
          <button type="button" class="im-cap-x" data-act="cancel" title="關閉 (Esc)">×</button>
        </div>
        <div class="im-cap-shot-wrap">
          <img id="im-cap-shot" alt="截圖" hidden title="點擊放大">
          <div id="im-cap-shot-empty" class="im-cap-shot-empty">（無截圖）</div>
        </div>
        <div class="im-cap-scope">
          <label><input type="radio" name="im-scope" value="word" checked> 單字</label>
          <label><input type="radio" name="im-scope" value="sentence"> 整句</label>
        </div>
        <label class="im-cap-field-l">單字</label>
        <input class="im-cap-input" id="im-cap-word" type="text">
        <div class="im-cap-field-row">
          <label class="im-cap-field-l">整句</label>
          <button type="button" class="im-cap-tts-sentence" id="im-cap-tts-sentence" title="整句發音（TTS）" disabled>🔊 整句</button>
        </div>
        <textarea class="im-cap-input" id="im-cap-sentence" rows="2"></textarea>

        <div class="im-cap-result">
          <div class="im-cap-tr-row">
            <div class="im-cap-tr-text" id="im-cap-tr">⏳ 查詢中…</div>
            <button type="button" class="im-cap-tts" id="im-cap-tts" title="發音（TTS）" disabled>🔊</button>
          </div>
          <div id="im-cap-dict"></div>
        </div>

        <div class="im-cap-status" id="im-cap-status">
          <span class="im-cap-st-item wait"><span class="dot"></span>翻譯…</span>
          <span class="im-cap-st-item wait"><span class="dot"></span>字典…</span>
          <span class="im-cap-st-item wait"><span class="dot"></span>擷取…</span>
        </div>

        <div class="im-cap-meta">
          <div class="im-cap-meta-text">
            <div>時間軸：<span id="im-cap-time">--:--</span></div>
            <a id="im-cap-link" href="#" target="_blank" rel="noopener">在 YouTube 開啟此時間點 ↗</a>
          </div>
          <div style="display:flex;gap:6px;align-items:center;">
            <button type="button" class="im-cap-replay-btn" data-act="replay">↺ 重播此句</button>
            <button type="button" class="im-cap-replay-btn" data-act="loop" title="只在這句的片段循環播放">🔁 循環片段</button>
            <span class="im-cap-pause-tag" title="對話框開啟時自動暫停影片">⏸ 已暫停</span>
          </div>
        </div>
        <div class="im-cap-actions">
          <button type="button" class="im-cap-btn ghost" data-act="cancel">取消</button>
          <button type="button" class="im-cap-btn primary" data-act="send">送出擷取</button>
        </div>
      </div>
    `;
    document.body.appendChild(captureDialog);

    captureDialog.addEventListener("click", (e) => {
      if (e.target === captureDialog) { hideCaptureDialog(); return; }
      const act = e.target.closest("[data-act]")?.dataset.act;
      if (act === "cancel") hideCaptureDialog();
      else if (act === "send") void sendFromDialog();
      else if (act === "replay") {
        if (dialogCtx) seekTo(dialogCtx.startSec);
      }
      else if (act === "loop") {
        if (dialogCtx) toggleClipLoop(dialogCtx.startSec);
      }
    });
    captureDialog.addEventListener("change", (e) => {
      if (e.target.name === "im-scope") {
        const v = e.target.value;
        if (v === "sentence") $("#im-cap-sentence")?.focus?.();
        else $("#im-cap-word")?.focus?.();
      }
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && captureDialog && captureDialog.style.display === "flex") hideCaptureDialog();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && lightbox) closeLightbox();
    });

    // TTS 發音鈕
    captureDialog.querySelector("#im-cap-tts").addEventListener("click", (e) => {
      e.stopPropagation();
      void playTts("word");
    });
    captureDialog.querySelector("#im-cap-tts-sentence").addEventListener("click", (e) => {
      e.stopPropagation();
      void playTts("sentence");
    });
    // 截圖點擊放大（lightbox）
    captureDialog.querySelector("#im-cap-shot").addEventListener("click", (e) => {
      e.stopPropagation();
      const img = e.currentTarget;
      if (!img || !img.src) return;
      openLightbox(img.src);
    });
  }

  // id 工具：對話框內以 selector 查詢
  function $(sel) { return captureDialog?.querySelector(sel); }

  // ---- 對話框自動暫停/回復 ----
  let videoPauseState = null;
  function pauseVideoForDialog() {
    if (videoPauseState) return;
    const v = document.querySelector("video");
    if (!v) return;
    videoPauseState = { wasPlaying: !v.paused && !v.ended };
    try { v.pause(); } catch {}
  }
  function resumeVideoAfterDialog() {
    if (!videoPauseState) return;
    const v = document.querySelector("video");
    const wasPlaying = videoPauseState.wasPlaying;
    videoPauseState = null;
    if (v && wasPlaying) {
      try { const p = v.play(); if (p && p.catch) p.catch(() => {}); } catch {}
    }
  }

  let dialogCtx = null; // {word, sentence, videoId, startSec, screenshot}

  async function captureWord(word, sentence, startSec, anchor) {
    dialogCtx = {
      word,
      sentence,
      videoId: getVideoId(),
      startSec,
      screenshot: captureScreenshot(),
    };
    openCaptureDialog();
    // 背景查詢：翻譯 + 字典
    setStatusItem(0, "wait", "翻譯…");
    setStatusItem(1, "wait", "字典…");
    setStatusItem(2, "wait", "擷取待送出");
    const tr = await translateWord(word);
    const trEl = $("#im-cap-tr");
    if (tr.ok) {
      trEl.textContent = tr.result ? `譯文：${tr.result}` : "（查無譯文）";
      setStatusItem(0, "ok", "翻譯 ✓");
    } else {
      trEl.textContent = `翻譯失敗：${tr.error || "API 錯誤"}`;
      setStatusItem(0, "err", "翻譯 ✗");
    }
    dialogCtx._translation = tr.ok ? tr.result : undefined;

    const d = await lookupWord(word);
    renderDictionary(d.ok ? d.entry : null, d.ok, d.ok ? undefined : d.error);
    if (d.ok) setStatusItem(1, "ok", d.entry ? "字典 ✓" : "字典（無詞條）");
    else setStatusItem(1, "err", "字典 ✗");
    dialogCtx._dictionaryEntry = d.ok ? d.entry : undefined;

    // 啟用 TTS（以目標語文字發音）
    const ttsBtn = $("#im-cap-tts");
    if (ttsBtn) ttsBtn.disabled = false;
    const ttsSentBtn = $("#im-cap-tts-sentence");
    if (ttsSentBtn) ttsSentBtn.disabled = false;
  }

  function renderDictionary(entry, ok, errMsg) {
    const el = $("#im-cap-dict");
    if (!el) return;
    if (!ok) { el.innerHTML = `<div class="im-cap-ex">字典查詢失敗：${esc(errMsg || "API 錯誤")}</div>`; return; }
    if (!entry) { el.innerHTML = `<div class="im-cap-ex">（字典無此詞條）</div>`; return; }
    let html = "";
    if (entry.ipa) html += `<div class="im-cap-ipa">/${esc(entry.ipa)}/</div>`;
    if (entry.partOfSpeech) html += `<div class="im-cap-pos">詞性：${esc(entry.partOfSpeech)}</div>`;
    if (entry.definitions?.length) {
      html += `<div class="im-cap-defs">` +
        entry.definitions.slice(0, 5).map((d) => `<div class="im-cap-def">${esc(d)}</div>`).join("") +
        `</div>`;
    }
    if (entry.examples?.length) {
      html += entry.examples.slice(0, 2).map((ex) =>
        `<div class="im-cap-ex">例：<b>${esc(ex.text)}</b>${ex.translation ? ` — ${esc(ex.translation)}` : ""}</div>`
      ).join("");
    }
    el.innerHTML = html || `<div class="im-cap-ex">（無釋義資料）</div>`;
  }

  // API 狀態列：idx 0=翻譯 1=字典 2=擷取
  function setStatusItem(idx, state, text) {
    const items = captureDialog?.querySelectorAll(".im-cap-st-item");
    if (!items || !items[idx]) return;
    const it = items[idx];
    it.classList.remove("ok", "err", "wait");
    it.classList.add(state);
    const txt = it.querySelector(".dot");
    // 文字在 dot 之後的文字節點
    it.lastChild.textContent = " " + text;
  }

  function openCaptureDialog() {
    buildCaptureDialog();
    const ctx = dialogCtx;
    const wasOpen = captureDialog.style.display === "flex";
    $("#im-cap-word").value = ctx.word;
    $("#im-cap-sentence").value = ctx.sentence;
    $("#im-cap-tr").textContent = "⏳ 查詢中…";
    $("#im-cap-dict").innerHTML = "";
    const shot = $("#im-cap-shot");
    const shotEmpty = $("#im-cap-shot-empty");
    if (ctx.screenshot) { shot.src = ctx.screenshot; shot.hidden = false; shotEmpty.hidden = true; }
    else { shot.hidden = true; shotEmpty.hidden = false; }
    $("#im-cap-time").textContent = fmtSec(ctx.startSec);
    $("#im-cap-link").href = `https://www.youtube.com/watch?v=${ctx.videoId}&t=${ctx.startSec}s`;
    captureDialog.style.display = "flex";
    if (!wasOpen) pauseVideoForDialog();
    setTimeout(() => $("#im-cap-word")?.focus?.(), 0);
  }

  function hideCaptureDialog() {
    if (captureDialog) captureDialog.style.display = "none";
    stopClipLoop();
    closeLightbox();
    resumeVideoAfterDialog();
    dialogCtx = null;
  }

  async function sendFromDialog() {
    if (!dialogCtx) return;
    const scope = captureDialog.querySelector('input[name="im-scope"]:checked')?.value || "word";
    const word = $("#im-cap-word").value.trim();
    const sentence = $("#im-cap-sentence").value.trim();
    const finalWord = scope === "sentence" ? (word || sentence.slice(0, 24)) : word;
    if (!finalWord) { hideCaptureDialog(); return; }
    const payload = {
      word: finalWord,
      sentence: sentence || dialogCtx.sentence,
      videoId: dialogCtx.videoId,
      startSec: dialogCtx.startSec,
      screenshot: dialogCtx.screenshot,
      translation: dialogCtx._translation,
      dictionaryEntry: dialogCtx._dictionaryEntry,
    };
    setStatusItem(2, "wait", "擷取中…");
    const ok = await postCapture(payload, true);
    setStatusItem(2, ok ? "ok" : "err", ok ? "擷取 ✓" : "擷取 ✗（已暫存）");
    if (!ok) await enqueueCapture(payload);
    showFloating(ok ? "✅ 已擷取" : "已暫存（離線）");
    if (ok) hideCaptureDialog();
  }

  // ---- TTS 發音（呼叫本機 /api/tts，回傳音檔播放） ----
  let langsCache = null; // /api/languages 結果快取
  async function resolveVoice() {
    if (langsCache) return langsCache;
    try {
      const res = await fetch(`${cfg.baseUrl}/api/languages`, { method: "GET" });
      if (res.ok) {
        const data = await res.json();
        langsCache = data.languages ?? [];
      }
    } catch {}
    return langsCache ?? [];
  }
  async function getDefaultVoice() {
    const langs = await resolveVoice();
    const pack = langs.find((l) => l.code === cfg.targetLang);
    return pack?.tts?.defaultVoice ?? "";
  }

  async function playTts(which) {
    if (!dialogCtx) return;
    // which: "word"（單字，預設）| "sentence"（整句）
    const text = which === "sentence"
      ? ($("#im-cap-sentence")?.value?.trim() || dialogCtx.sentence || "")
      : ($("#im-cap-word")?.value?.trim() || dialogCtx.word || "");
    if (!text) return;
    const ttsBtn = which === "sentence" ? $("#im-cap-tts-sentence") : $("#im-cap-tts");
    if (ttsBtn) { ttsBtn.disabled = true; ttsBtn.textContent = "⏳"; }
    try {
      const voice = await getDefaultVoice();
      const res = await fetch(`${cfg.baseUrl}/api/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, voice, lang: cfg.targetLang }),
      });
      const ct = res.headers.get("content-type") || "";
      if (res.ok && ct.startsWith("audio/")) {
        // 雲端 TTS：回傳音檔 bytes → blob 播放
        const buf = await res.arrayBuffer();
        const blob = new Blob([buf], { type: ct });
        const url = URL.createObjectURL(blob);
        playAudioUrl(url);
        return;
      }
      // JSON 回應：browser 模式或錯誤 → 降級瀏覽器原生語音合成
      throw new Error("fallback");
    } catch {
      try {
        const u = new SpeechSynthesisUtterance(text);
        u.lang = cfg.targetLang;
        speechSynthesis.cancel();
        speechSynthesis.speak(u);
      } catch {}
    } finally {
      if (ttsBtn) { ttsBtn.disabled = false; ttsBtn.textContent = "🔊"; }
    }
  }

  function playAudioUrl(url) {
    try {
      const audio = new Audio(url);
      audio.onended = () => URL.revokeObjectURL(url);
      audio.play().catch(() => {});
    } catch {}
  }

  // ---- 截圖放大 lightbox ----
  let lightbox = null;
  function openLightbox(src) {
    if (lightbox) { lightbox.remove(); lightbox = null; }
    lightbox = document.createElement("div");
    lightbox.className = "im-lightbox";
    lightbox.innerHTML = `<img src="${src}" alt="放大截圖"><button type="button" class="im-lightbox-x" title="關閉 (Esc)">×</button>`;
    lightbox.addEventListener("click", () => closeLightbox());
    document.body.appendChild(lightbox);
  }
  function closeLightbox() {
    if (lightbox) { lightbox.remove(); lightbox = null; }
  }

  // ---- 啟動側欄 ----
  buildSidebar();
  applySidebarVisibility();

  // ---- Hover 即時查詢預覽 ----
  const trCache = new Map();
  let hoverTimer = 0;
  let hoverTip = null;
  let hoverWord = null;

  function ensureHoverTip() {
    if (hoverTip) return;
    hoverTip = document.createElement("div");
    hoverTip.className = "im-hover-tip";
    document.body.appendChild(hoverTip);
  }
  function positionHoverTip(anchor) {
    const r = anchor.getBoundingClientRect();
    hoverTip.style.left = `${r.left + window.scrollX}px`;
    hoverTip.style.top = `${r.bottom + window.scrollY + 4}px`;
  }
  function showHoverTip(anchor, text) {
    ensureHoverTip();
    hoverTip.textContent = text;
    positionHoverTip(anchor);
    hoverTip.style.display = "block";
  }
  function hideHoverTip() {
    if (hoverTip) hoverTip.style.display = "none";
  }
  function onHoverMove(ev) {
    if (!cfg.enabled || !cfg.hoverPreview) { hideHoverTip(); return; }
    const wordEl = ev.target.closest?.(".im-word");
    if (!wordEl) { if (hoverWord) { clearTimeout(hoverTimer); hoverWord = null; hideHoverTip(); } return; }
    const w = cleanWord(wordEl.dataset.word ?? wordEl.textContent ?? "");
    if (!w) return;
    if (hoverWord === w && hoverTip?.style.display === "block") { positionHoverTip(wordEl); return; }
    hoverWord = w;
    clearTimeout(hoverTimer);
    hoverTimer = setTimeout(async () => {
      let tr = trCache.get(w);
      if (tr === undefined) {
        const r = await translateWord(w);
        tr = r.ok ? r.result : "";
        trCache.set(w, tr || "");
      }
      if (hoverWord === w) showHoverTip(wordEl, tr ? `📝 ${tr}` : "（無譯文）");
    }, 320);
  }
  function onHoverOut(ev) {
    if (!ev.target.closest?.(".im-word")) return;
    clearTimeout(hoverTimer);
    hoverWord = null;
    hideHoverTip();
  }
  document.addEventListener("mouseover", onHoverMove, true);
  document.addEventListener("mouseout", onHoverOut, true);

  // ---- 觀察字幕容器 ----
  // 僅在播放頁觀察 #movie_player；絕不回退到 document.body，
  // 否則在首頁會觀察整個 body，與 YouTube 持續變動的 DOM（縮圖、無限捲動、hover 預覽）
  // 及側欄的 DOM 寫入形成回饋迴圈，導致首頁影片持續轉圈無法載入。
  let mo = null;
  function setupCaptionObserver() {
    if (mo) { mo.disconnect(); mo = null; }
    if (!cfg.enabled || !isWatchPage()) return;
    const player = document.querySelector("#movie_player");
    if (!player) return;  // 播放器尚未出現：交由 navigate/輪詢重試
    mo = new MutationObserver(() => processAllSegments());
    mo.observe(player, { childList: true, subtree: true, characterData: true });
    processAllSegments();
  }
  setupCaptionObserver();
  // 持續輕量輪詢：進入播放頁且 #movie_player 剛掛上時接上觀察者；
  // 離開播放頁時由 navigate handler 透過 setupCaptionObserver() 斷開。
  setInterval(() => {
    if (isWatchPage() && document.querySelector("#movie_player") && !mo) setupCaptionObserver();
  }, 1500);

  document.addEventListener("click", onCaptionClick, true);

  // ---- 快捷鍵 ----
  document.addEventListener("keydown", (e) => {
    if (captureDialog && captureDialog.style.display === "flex") return;
    const tag = (e.target?.tagName || "").toLowerCase();
    const inField = tag === "input" || tag === "textarea" || e.target?.isContentEditable;
    if (e.key === "q" || e.key === "Q") {
      if (inField) return;
      e.preventDefault();
      void saveScenario();
    }
    if (e.key === "p" || e.key === "P") {
      if (inField) return;
      e.preventDefault();
      setSidebarOpen(!cfg.sidebarOpen);
    }
  });

  // ---- 來自 background（點擊工具列圖示切換）的即時通知 ----
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type !== "im-toggle") return;
    if (typeof msg.enabled === "boolean") cfg.enabled = msg.enabled;
    if (typeof msg.sidebarOpen === "boolean") cfg.sidebarOpen = msg.sidebarOpen;
    applyListeningMode();
    applySidebarVisibility();
  });
})();
