/* 外語沉浸擷取 — background service worker (MV3)
 *
 * 點擊工具列圖示 = 切換擷取視窗（開 / 關）。
 * 狀態寫入 chrome.storage.sync（content script 會自動反應），
 * 並以 badge 即時反映 ON / OFF。設定頁請由「右鍵圖示 → 選項」開啟。
 */

const DEFAULTS = { enabled: true };

async function refreshBadge() {
  const { enabled } = { ...DEFAULTS, ...(await chrome.storage.sync.get(DEFAULTS)) };
  await chrome.action.setBadgeText({ text: enabled ? "ON" : "OFF" });
  await chrome.action.setBadgeBackgroundColor({ color: enabled ? "#16a34a" : "#9ca3af" });
}

chrome.runtime.onInstalled.addListener(refreshBadge);
chrome.runtime.onStartup.addListener(refreshBadge);
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "sync" && changes.enabled) void refreshBadge();
});
// 啟動 service worker 時也同步一次 badge（涵蓋無 onInstalled/onStartup 的喚醒情境）
refreshBadge();

chrome.action.onClicked.addListener(async (tab) => {
  const { enabled } = { ...DEFAULTS, ...(await chrome.storage.sync.get(DEFAULTS)) };
  const next = !enabled;
  const patch = { enabled: next };
  if (next) patch.sidebarOpen = true; // 開啟時自動展開側欄，符合「點一下就開」
  await chrome.storage.sync.set(patch);
  // storage 事件會讓 content script 自動反應；另送訊息確保即時套用。
  if (tab?.id && /^https:\/\/(www\.)?youtube\.com\//.test(tab.url || "")) {
    chrome.tabs
      .sendMessage(tab.id, { type: "im-toggle", enabled: next, sidebarOpen: next })
      .catch(() => {/* 頁面可能還沒有 content script */});
  }
});