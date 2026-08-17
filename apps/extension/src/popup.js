const DEFAULTS = {
  baseUrl: "http://localhost:3000",
  targetLang: "es",
  sourceLang: "zh",
  enabled: true,
  listeningMode: false,
  sidebarOpen: true,
  hoverPreview: true,
  ytRate: 1,
};

const $ = (id) => document.getElementById(id);

async function load() {
  const cfg = { ...DEFAULTS, ...(await chrome.storage.sync.get(DEFAULTS)) };
  $("baseUrl").value = cfg.baseUrl;
  $("targetLang").value = cfg.targetLang;
  $("sourceLang").value = cfg.sourceLang;
  $("enabled").checked = cfg.enabled;
  $("listeningMode").checked = cfg.listeningMode;
  $("sidebarOpen").checked = cfg.sidebarOpen !== false;
  $("hoverPreview").checked = cfg.hoverPreview !== false;
  $("ytRate").value = String(cfg.ytRate ?? 1);
  setStatus(`已載入設定（網址：${cfg.baseUrl}）`);
}

async function save() {
  const patch = {
    baseUrl: $("baseUrl").value.trim() || DEFAULTS.baseUrl,
    targetLang: $("targetLang").value.trim() || DEFAULTS.targetLang,
    sourceLang: $("sourceLang").value.trim() || DEFAULTS.sourceLang,
    enabled: $("enabled").checked,
    listeningMode: $("listeningMode").checked,
    sidebarOpen: $("sidebarOpen").checked,
    hoverPreview: $("hoverPreview").checked,
    ytRate: Number($("ytRate").value) || 1,
  };
  await chrome.storage.sync.set(patch);
  setStatus("已儲存。重新整理 YouTube 分頁生效。");
}

async function testConn() {
  const BASE = $("baseUrl").value.trim() || DEFAULTS.baseUrl;
  const el = $("connStatus");
  el.className = "status";
  el.textContent = "測試中…";
  try {
    const res = await fetch(`${BASE}/api/languages`, { method: "GET" });
    if (res.ok) {
      el.className = "status ok";
      el.textContent = `✅ 連線正常（${BASE}）`;
    } else {
      el.className = "status err";
      el.textContent = `❌ 伺服器回應 ${res.status}`;
    }
  } catch (e) {
    el.className = "status err";
    el.textContent = `❌ 無法連線：${e.message}（確認本機網站已啟動）`;
  }
}

async function flushBuffer() {
  const BASE = $("baseUrl").value.trim() || DEFAULTS.baseUrl;
  const KEY = "captureBuffer";
  const buf = (await chrome.storage.local.get(KEY))[KEY] ?? [];
  if (!buf.length) return setStatus("暫存為空");
  const remaining = [];
  let sent = 0;
  for (const p of buf) {
    try {
      const res = await fetch(`${BASE}/api/capture`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...p, source: "youtube" }),
      });
      if (res.ok) sent++;
      else remaining.push(p);
    } catch { remaining.push(p); }
  }
  await chrome.storage.local.set({ [KEY]: remaining });
  setStatus(`補傳 ${sent} 筆，剩餘 ${remaining.length} 筆。`);
}

function setStatus(msg) { $("status").textContent = msg; }

function refreshPowerStatus(enabled) {
  const el = $("powerStatus");
  if (!el) return;
  el.className = "status " + (enabled ? "ok" : "");
  el.textContent = enabled ? "● 目前狀態：ON（擷取中）" : "○ 目前狀態：OFF（已關閉）";
}

document.addEventListener("DOMContentLoaded", () => {
  load();
  void chrome.storage.sync.get({ enabled: true }).then((r) => refreshPowerStatus(r.enabled));
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "sync" && "enabled" in changes) refreshPowerStatus(changes.enabled.newValue);
});
$("save").addEventListener("click", save);
$("test").addEventListener("click", testConn);
$("flush").addEventListener("click", flushBuffer);
$("ytRate").addEventListener("change", save);
