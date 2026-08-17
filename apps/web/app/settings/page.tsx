"use client";

import { useEffect, useState, useCallback } from "react";

interface KeyStatus {
  name: string;
  label: string;
  description: string;
  link?: string;
  set: boolean;
  source: "store" | "env" | "none";
}

export default function SettingsPage() {
  const [keys, setKeys] = useState<KeyStatus[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState<string>("");
  const [testResult, setTestResult] = useState("");

  const refresh = useCallback(async () => {
    const res = await fetch("/api/keys");
    const data = await res.json();
    setKeys(data.keys ?? []);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

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
        setMsg(`✓ ${name} 已${value.trim() ? "儲存（加密寫入本機）" : "清除"}`);
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
    setTestResult("測試中…");
    try {
      const res = await fetch("/api/translate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: "hola", from: "es", to: "zh" }),
      });
      const data = await res.json();
      if (data.error) setTestResult(`❌ ${data.error}（provider: ${data.provider ?? "?"}）`);
      else setTestResult(`✓ "${data.result}"（provider: ${data.provider}${data.cached ? " · 快取" : ""}）`);
    } catch (e) {
      setTestResult(`❌ ${e instanceof Error ? e.message : "測試失敗"}`);
    }
  }

  return (
    <main className="max-w-3xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold mb-1">⚙️ 設定</h1>
      <p className="text-sm text-[var(--text-muted)] mb-6">
        管理 API Key 與學習設定。
      </p>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-2">🔑 API Key 託管</h2>
        <div className="note bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-900 mb-4">
          在此貼上的 Key 會以 <b>AES-256-GCM</b> 加密存於本機 <code>data/.keys/</code>，
          前端永遠拿不到明文（只顯示遮罩狀態）。擴充套件的 hover 翻譯會透過本機站代理使用這裡的 Key，
          不必再編輯 <code>.env.local</code>。環境變數仍可作為 fallback。
        </div>

        <div className="space-y-4">
          {keys.map((k) => (
            <div key={k.name} className="border rounded-lg p-4">
              <div className="flex items-center justify-between mb-1">
                <div>
                  <span className="font-bold">{k.label}</span>
                  <code className="ml-2 text-xs text-[var(--text-muted)]">{k.name}</code>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full ${
                  k.set
                    ? k.source === "env" ? "bg-amber-100 text-amber-800" : "bg-green-100 text-green-800"
                    : "bg-gray-100 text-gray-500"
                }`}>
                  {k.set ? (k.source === "env" ? "已設定（env）" : "已設定（加密）") : "未設定"}
                </span>
              </div>
              <p className="text-xs text-[var(--text-muted)] mb-2">{k.description}</p>
              {k.link && (
                <a href={k.link} target="_blank" rel="noreferrer" className="text-xs text-blue-600 underline mr-3">
                  取得 Key ↗
                </a>
              )}
              <div className="flex gap-2 mt-2">
                <input
                  type={k.name.includes("ENDPOINT") ? "text" : "password"}
                  placeholder={k.set ? "••••••（已設定，可貼新值覆寫）" : "貼上你的 Key…"}
                  value={drafts[k.name] ?? ""}
                  onChange={(e) => setDrafts((d) => ({ ...d, [k.name]: e.target.value }))}
                  className="flex-1 border rounded px-3 py-2 text-sm"
                  autoComplete="off"
                />
                <button
                  onClick={() => save(k.name)}
                  disabled={busy === k.name}
                  className="bg-[var(--brand)] text-white px-4 py-2 rounded text-sm font-bold disabled:opacity-50"
                >
                  {busy === k.name ? "…" : "儲存"}
                </button>
                {k.set && (
                  <button
                    onClick={() => remove(k.name)}
                    disabled={busy === k.name}
                    className="border px-3 py-2 rounded text-sm disabled:opacity-50"
                  >
                    刪除
                  </button>
                )}
              </div>
            </div>
          ))}
          {keys.length === 0 && <p className="text-sm text-gray-500">載入中…</p>}
        </div>

        <div className="mt-4 flex items-center gap-3">
          <button onClick={testTranslate} className="border px-4 py-2 rounded text-sm">
            🔌 測試翻譯（hola → zh）
          </button>
          <span className="text-sm">{testResult}</span>
        </div>

        {msg && <p className="mt-3 text-sm">{msg}</p>}
      </section>
    </main>
  );
}