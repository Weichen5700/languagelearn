"use client";

import { useEffect, useState } from "react";
import { saveSettings, type Settings } from "@/lib/store/settings";
import { useSettings } from "@/lib/store/hooks";

interface KeyStatus {
  name: string;
  label: string;
  description: string;
  link?: string;
  set: boolean;
  source: "store" | "env" | "none";
}

const TARGET_LANG_OPTIONS = [
  { code: "es", name: "西班牙文 (Español)", flag: "🇪🇸" },
  { code: "en", name: "英文 (English)", flag: "🇬🇧" },
  { code: "ja", name: "日文 (日本語)", flag: "🇯🇵" },
  { code: "ko", name: "韓文 (한국어)", flag: "🇰🇷" },
  { code: "fr", name: "法文 (Français)", flag: "🇫🇷" },
  { code: "de", name: "德文 (Deutsch)", flag: "🇩🇪" },
  { code: "zh", name: "中文 (繁體/簡體)", flag: "🇹🇼" },
];

const SOURCE_LANG_OPTIONS = [
  { code: "zh", name: "中文 (繁體/簡體)", flag: "🇹🇼" },
  { code: "en", name: "英文 (English)", flag: "🇬🇧" },
];

export default function SettingsPage() {
  const [keys, setKeys] = useState<KeyStatus[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState<string>("");
  const [testResult, setTestResult] = useState("");
  // 檔案系統可寫時才能站內保存 Key（Vercel 等 serverless 為唯讀）
  const [keysWritable, setKeysWritable] = useState(true);

  // 學習偏好設定：以 localStorage 為來源，本地編輯先存 draft，按「儲存」才寫回
  const storeSettings = useSettings();
  const [settingsDraft, setSettingsDraft] = useState<Partial<Settings>>({});
  const settings: Settings = { ...storeSettings, ...settingsDraft };
  const [settingsSavedToast, setSettingsSavedToast] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/keys");
        const data = await res.json();
        setKeys(data.keys ?? []);
        setKeysWritable(data.writable ?? true);
      } catch {
        // ignore
      }
    })();
  }, []);

  function handleSaveSettings() {
    saveSettings(settings);
    setSettingsDraft({});
    setSettingsSavedToast(true);
    setTimeout(() => setSettingsSavedToast(false), 2500);
  }

  async function save(name: string) {
    const value = drafts[name] ?? "";
    setBusy(name);
    setMsg("");
    try {
      const res = await fetch("/api/keys", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, value }),
      });
      const data = await res.json();
      if (!res.ok) setMsg(`❌ ${data.error ?? "儲存失敗"}`);
      else {
        setKeys(data.keys ?? keys);
        setDrafts((d) => ({ ...d, [name]: "" }));
        setMsg(`✓ ${name} 已${value.trim() ? "儲存（AES-256 加密寫入本機）" : "清除"}`);
      }
    } catch (e) {
      setMsg(`❌ ${e instanceof Error ? e.message : "儲存失敗"}`);
    } finally {
      setBusy("");
    }
  }

  async function remove(name: string) {
    if (!confirm(`確定刪除 ${name}？`)) return;
    setBusy(name);
    setMsg("");
    try {
      const res = await fetch("/api/keys", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (!res.ok) setMsg(`❌ ${data.error ?? "刪除失敗"}`);
      else { setKeys(data.keys ?? keys); setMsg(`✓ ${name} 已刪除`); }
    } catch (e) {
      setMsg(`❌ ${e instanceof Error ? e.message : "刪除失敗"}`);
    } finally {
      setBusy("");
    }
  }

  async function testTranslate() {
    setTestResult("測試連線中…");
    try {
      const res = await fetch("/api/translate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: "hola", from: settings.targetLang, to: settings.sourceLang }),
      });
      const data = await res.json();
      if (data.error) setTestResult(`❌ ${data.error}（服務商: ${data.provider ?? "?"}）`);
      else setTestResult(`✓ "${data.result}"（服務商: ${data.provider}${data.cached ? " · 快取" : ""}）`);
    } catch (e) {
      setTestResult(`❌ ${e instanceof Error ? e.message : "測試失敗"}`);
    }
  }

  return (
    <main className="max-w-3xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-extrabold flex items-center gap-2">
          <span>⚙️</span> 系統設定與偏好
        </h1>
        <p className="text-sm text-[var(--text-muted)] mt-0.5">
          自訂學習語言方向、每日任務配額、FSRS 記憶模型及本機加密 API Key
        </p>
      </div>

      {/* 學習與語言偏好設定 */}
      <section className="card p-6 space-y-5 border-2 border-[var(--border)] shadow-xs">
        <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <span>🌐</span> 語言與學習偏好
          </h2>
          <span className="text-xs text-[var(--text-muted)]">本地儲存 · 換語言免改程式碼</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-bold text-gray-700 mb-1 block">預設目標外語 (Target)</label>
            <select
              value={settings.targetLang}
              onChange={e => setSettingsDraft({ ...settings, targetLang: e.target.value })}
              className="w-full border-2 rounded-2xl px-3 py-2 text-sm font-bold bg-white"
            >
              {TARGET_LANG_OPTIONS.map(opt => (
                <option key={opt.code} value={opt.code}>{opt.flag} {opt.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-bold text-gray-700 mb-1 block">母語 / 釋義語言 (Source)</label>
            <select
              value={settings.sourceLang}
              onChange={e => setSettingsDraft({ ...settings, sourceLang: e.target.value })}
              className="w-full border-2 rounded-2xl px-3 py-2 text-sm font-bold bg-white"
            >
              {SOURCE_LANG_OPTIONS.map(opt => (
                <option key={opt.code} value={opt.code}>{opt.flag} {opt.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
          <div>
            <label className="text-xs font-bold text-gray-700 mb-1 block">每日新卡上限</label>
            <input
              type="number"
              min={0}
              max={200}
              value={settings.newCardsPerDay}
              onChange={e => setSettingsDraft({ ...settings, newCardsPerDay: Number(e.target.value) })}
              className="w-full border-2 rounded-2xl px-3 py-2 text-sm font-bold bg-white"
            />
            <span className="text-[11px] text-[var(--text-muted)] mt-1 block">建議 15~30 張</span>
          </div>

          <div>
            <label className="text-xs font-bold text-gray-700 mb-1 block">每日複習上限</label>
            <input
              type="number"
              min={10}
              max={1000}
              value={settings.reviewsPerDay}
              onChange={e => setSettingsDraft({ ...settings, reviewsPerDay: Number(e.target.value) })}
              className="w-full border-2 rounded-2xl px-3 py-2 text-sm font-bold bg-white"
            />
            <span className="text-[11px] text-[var(--text-muted)] mt-1 block">避免單日複習過載</span>
          </div>

          <div>
            <label className="text-xs font-bold text-gray-700 mb-1 block">FSRS 目標記憶留存率</label>
            <select
              value={settings.requestRetention}
              onChange={e => setSettingsDraft({ ...settings, requestRetention: Number(e.target.value) })}
              className="w-full border-2 rounded-2xl px-3 py-2 text-sm font-bold bg-white"
            >
              <option value={0.85}>85%（複習頻率較低）</option>
              <option value={0.90}>90%（標準推薦）</option>
              <option value={0.95}>95%（高強度記憶）</option>
            </select>
            <span className="text-[11px] text-[var(--text-muted)] mt-1 block">FSRS-v4 演算法參數</span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
          <div>
            <label className="text-xs font-bold text-gray-700 mb-1 block">TTS 預設語速 ({settings.playbackRate}x)</label>
            <input
              type="range"
              min={0.5}
              max={1.5}
              step={0.1}
              value={settings.playbackRate}
              onChange={e => setSettingsDraft({ ...settings, playbackRate: Number(e.target.value) })}
              className="w-full cursor-pointer accent-[var(--brand)]"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-gray-700 mb-1 block">YouTube 影片重播語速 ({settings.ytRate}x)</label>
            <input
              type="range"
              min={0.5}
              max={1.5}
              step={0.1}
              value={settings.ytRate}
              onChange={e => setSettingsDraft({ ...settings, ytRate: Number(e.target.value) })}
              className="w-full cursor-pointer accent-[var(--brand)]"
            />
          </div>
        </div>

        <div className="flex items-center justify-between pt-3 border-t border-[var(--border)]">
          {settingsSavedToast ? (
            <span className="text-xs font-bold text-[var(--brand-dark)] animate-pop">
              ✓ 設定已成功儲存至本機！
            </span>
          ) : (
            <span className="text-xs text-[var(--text-muted)]">修改後點擊儲存立即生效</span>
          )}

          <button
            onClick={handleSaveSettings}
            className="btn btn-primary px-6 py-2 text-sm shadow-sm"
          >
            ✓ 儲存學習偏好
          </button>
        </div>
      </section>

      {/* API Key 加密託管區 */}
      <section className="card p-6 space-y-4 border-2 border-[var(--border)] shadow-xs">
        <h2 className="text-xl font-bold flex items-center gap-2">
          <span>🔑</span> 第三方 API Key 託管
        </h2>

        <div className="bg-blue-50/70 border border-blue-200 rounded-2xl p-4 text-xs text-blue-900 leading-relaxed">
          <b>安全保護：</b>在此輸入的 Key 會以 <b>AES-256-GCM</b> 強度加密寫入本機 <code>data/.keys/</code>，
          前端只顯示遮罩狀態，永遠不會外洩明文。YouTube 擴充套件的 hover 查詞與翻譯會直接調用這裡的本機站 Key，
          無須重複手動設定。
        </div>

        {!keysWritable && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-xs text-amber-900 leading-relaxed">
            <b>⚠️ 此環境無法站內保存 Key：</b>檔案系統為唯讀（例如 Vercel / serverless），
            在此貼上的 Key 不會被保存。請改用<b>環境變數</b>設定，例如在 Vercel →
            Settings → Environment Variables 加入 <code>GOOGLE_API_KEY</code> 後重新部署；
            下方清單會顯示來源為 <b>env</b> 表示生效。
          </div>
        )}

        <div className="space-y-3.5">
          {keys.map((k) => (
            <div key={k.name} className="border-2 border-gray-100 rounded-2xl p-4 bg-gray-50/40 space-y-2">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <span className="font-extrabold text-sm text-gray-900">{k.label}</span>
                  <code className="ml-2 text-xs text-[var(--text-muted)] bg-white px-1.5 py-0.5 rounded border border-gray-200">
                    {k.name}
                  </code>
                </div>
                <span className={`text-xs px-2.5 py-0.5 rounded-full font-bold ${
                  k.set
                    ? k.source === "env" ? "bg-amber-100 text-amber-800" : "bg-green-100 text-green-800"
                    : "bg-gray-100 text-gray-500"
                }`}>
                  {k.set ? (k.source === "env" ? "已啟用 (環境變數)" : "已啟用 (AES加密)") : "未配置"}
                </span>
              </div>

              <p className="text-xs text-[var(--text-muted)]">{k.description}</p>
              {k.link && (
                <a href={k.link} target="_blank" rel="noreferrer" className="text-xs text-[var(--accent-blue)] hover:underline font-bold inline-block">
                  取得 API Key ↗
                </a>
              )}

              <div className="flex gap-2 pt-1">
                <input
                  type={k.name.includes("ENDPOINT") ? "text" : "password"}
                  placeholder={k.set ? "••••••••••••（已配置，可直接輸入新值覆寫）" : "請貼上 Key…"}
                  value={drafts[k.name] ?? ""}
                  onChange={(e) => setDrafts((d) => ({ ...d, [k.name]: e.target.value }))}
                  className="flex-1 border-2 rounded-2xl px-3 py-2 text-sm bg-white"
                  autoComplete="off"
                />
                <button
                  onClick={() => save(k.name)}
                  disabled={busy === k.name}
                  className="btn btn-primary px-4 py-2 text-xs font-bold"
                >
                  {busy === k.name ? "處理中…" : "儲存"}
                </button>
                {k.set && (
                  <button
                    onClick={() => remove(k.name)}
                    disabled={busy === k.name}
                    className="btn btn-ghost px-3 py-2 text-xs text-red-500 hover:bg-red-50 font-bold"
                  >
                    清除
                  </button>
                )}
              </div>
            </div>
          ))}

          {keys.length === 0 && <p className="text-sm text-[var(--text-muted)]">載入金鑰設定中…</p>}
        </div>

        <div className="pt-3 border-t border-[var(--border)] flex items-center gap-3 flex-wrap">
          <button onClick={testTranslate} className="btn btn-ghost px-4 py-2 text-xs font-bold">
            🔌 測試翻譯連線（{settings.targetLang} → {settings.sourceLang}）
          </button>
          <span className="text-xs font-semibold text-gray-700">{testResult}</span>
        </div>

        {msg && <div className="text-xs font-bold text-[var(--brand-dark)] animate-pop">{msg}</div>}
      </section>
    </main>
  );
}
