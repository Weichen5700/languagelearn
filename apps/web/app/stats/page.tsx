"use client";

import { useEffect, useState, useRef } from "react";
import { listCards, listLogs } from "@/lib/db";
import { computeStats, formatDuration, type DayBucket, type StateDistribution } from "@/lib/stats/aggregate";
import { exportAll, importAll } from "@/lib/io/importExport";
import { loadProfile, renameProfile } from "@/lib/store/profile";

const STATE_COLORS: Record<keyof StateDistribution, string> = {
  new: "bg-gray-400",
  learning: "bg-orange-400",
  review: "bg-green-500",
  relearning: "bg-red-400",
};
const STATE_LABELS: Record<keyof StateDistribution, string> = {
  new: "新卡",
  learning: "學習中",
  review: "複習中",
  relearning: "重學中",
};

function heatColor(count: number): string {
  if (count === 0) return "bg-gray-100";
  if (count < 3) return "bg-green-200";
  if (count < 8) return "bg-green-400";
  if (count < 15) return "bg-green-600";
  return "bg-green-800";
}

export default function StatsPage() {
  const [stats, setStats] = useState<ReturnType<typeof computeStats> | null>(null);
  const [profileName, setProfileName] = useState("");
  const [editingName, setEditingName] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function refresh() {
    const [cards, logs] = await Promise.all([listCards(), listLogs()]);
    setStats(computeStats(cards, logs));
  }

  useEffect(() => {
    refresh();
    setProfileName(loadProfile()?.name ?? "我");
  }, []);

  async function onExport() {
    const json = await exportAll();
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `flashcards-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click(); URL.revokeObjectURL(url);
  }

  async function onImport(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      const res = await importAll(await f.text());
      alert(`匯入：${res.decks} 牌組、${res.cards} 卡片`);
      refresh();
    } catch (err) { alert(`匯入失敗：${err}`); }
    e.target.value = "";
  }

  function saveName() {
    renameProfile(profileName.trim() || "我");
    setEditingName(false);
  }

  if (!stats) return <main className="min-h-screen p-8">載入中…</main>;

  // 熱力圖：84 天 = 12 週 × 7 天。欄=週，列=週幾。
  const weeks: DayBucket[][] = [];
  for (let w = 0; w < 12; w++) {
    const col: DayBucket[] = [];
    for (let d = 0; d < 7; d++) {
      const idx = w * 7 + d;
      if (idx < stats.daily.length) col.push(stats.daily[idx]);
    }
    weeks.push(col);
  }

  const totalStates = stats.totalCards || 1;

  return (
    <main className="min-h-screen p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-extrabold flex items-center gap-2">📊 學習統計</h1>
          <p className="text-[var(--text-muted)] text-sm">
            {editingName ? (
              <>
                <input value={profileName} onChange={e => setProfileName(e.target.value)} className="border-2 rounded-2xl px-2 py-0.5 text-sm" autoFocus />
                <button onClick={saveName} className="btn btn-primary ml-2 px-2 py-0.5 text-sm">儲存</button>
              </>
            ) : (
              <>👤 {profileName} <button onClick={() => setEditingName(true)} className="text-[var(--accent-blue)] underline text-xs ml-1">改名</button></>
            )}
          </p>
        </div>
      </div>

      {/* 總覽數字 */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        <Stat label="🃏 總單字卡" value={String(stats.totalCards)} />
        <Stat label="📌 今日待複習" value={String(stats.dueToday)} highlight={stats.dueToday > 0} />
        <Stat label="✅ 累計複習" value={String(stats.totalReviews)} />
        <Stat label="🔥 連續學習" value={`${stats.streak} 天`} />
        <Stat label="⏱ 總學習時長" value={formatDuration(stats.totalTimeSpentMs)} />
        <Stat label="📅 上次複習" value={stats.lastReviewDate ?? "尚未開始"} />
        <Stat label="🎬 影片沉浸卡" value={`${stats.immersionCards}${stats.totalCards ? ` (${Math.round(stats.immersionCards / stats.totalCards * 100)}%)` : ""}`} />
      </section>

      {/* 沉浸式學習來源占比 */}
      {stats.immersionCards > 0 && (
        <section className="card p-5 mb-8 border-2 border-[var(--border)]">
          <h2 className="text-lg font-bold mb-3 flex items-center gap-2">
            <span>🎬</span> 沉浸式語境卡片占比
          </h2>
          <div className="flex items-center gap-3">
            <div className="w-24 text-xs font-bold text-purple-900">YouTube 擷取</div>
            <div className="flex-1 bg-gray-100 rounded-full h-4 overflow-hidden border border-gray-200">
              <div className="bg-purple-500 h-4 rounded-full transition-all" style={{ width: `${Math.round(stats.immersionCards / (stats.totalCards || 1) * 100)}%` }} />
            </div>
            <div className="w-20 text-xs font-bold text-right text-purple-700">{stats.immersionCards} / {stats.totalCards}</div>
          </div>
          <p className="text-xs text-[var(--text-muted)] mt-2">
            從 YouTube 雙語字幕點擊自動收錄、帶時間軸原聲與影格截圖的單字卡比例。
          </p>
        </section>
      )}

      {/* 熱力圖 */}
      <section className="card p-5 mb-8 border-2 border-[var(--border)]">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <span>🗓</span> 學習熱力圖（最近 12 週）
          </h2>
          <span className="text-xs text-[var(--text-muted)]">每日持續練習累積記憶</span>
        </div>
        <div className="flex gap-1 overflow-x-auto pb-2">
          {weeks.map((col, wi) => (
            <div key={wi} className="flex flex-col gap-1">
              {col.map((d, di) => (
                <div
                  key={di}
                  title={`${d.date}: ${d.count} 次`}
                  className={`w-3.5 h-3.5 rounded-sm heat-cell ${heatColor(d.count)}`}
                />
              ))}
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2 text-xs text-[var(--text-muted)] mt-3">
          <span>少</span>
          <div className="w-3.5 h-3.5 rounded-sm bg-gray-100 border border-gray-200" />
          <div className="w-3.5 h-3.5 rounded-sm bg-green-200" />
          <div className="w-3.5 h-3.5 rounded-sm bg-green-400" />
          <div className="w-3.5 h-3.5 rounded-sm bg-green-600" />
          <div className="w-3.5 h-3.5 rounded-sm bg-green-800" />
          <span>多</span>
        </div>
      </section>

      {/* 卡片狀態分布 */}
      <section className="card p-5 mb-8 border-2 border-[var(--border)]">
        <h2 className="text-lg font-bold mb-3 flex items-center gap-2">
          <span>🧠</span> FSRS 記憶模型熟練度分布
        </h2>
        <div className="space-y-3">
          {(Object.keys(STATE_COLORS) as (keyof StateDistribution)[]).map(k => {
            const v = stats.stateDist[k];
            const pct = Math.round((v / totalStates) * 100);
            return (
              <div key={k} className="flex items-center gap-3">
                <div className="w-20 text-xs font-bold text-gray-700">{STATE_LABELS[k]}</div>
                <div className="flex-1 bg-gray-100 rounded-full h-4 overflow-hidden border border-gray-200">
                  <div className={`${STATE_COLORS[k]} h-4 rounded-full transition-all`} style={{ width: `${pct}%` }} />
                </div>
                <div className="w-20 text-xs font-bold text-right text-gray-700">{v} ({pct}%)</div>
              </div>
            );
          })}
        </div>
      </section>

      {/* 每日學習時長（最近 14 天） */}
      <section className="card p-5 mb-8 border-2 border-[var(--border)]">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <span>⏱</span> 每日學習時長（最近 14 天）
          </h2>
          <span className="text-xs text-[var(--text-muted)]">實際翻卡與答題耗時</span>
        </div>
        <div className="flex items-end gap-1.5 h-32 pt-4">
          {stats.daily.slice(-14).map((d, i) => {
            const maxMs = Math.max(1, ...stats.daily.slice(-14).map(x => x.timeSpentMs));
            const h = Math.round((d.timeSpentMs / maxMs) * 100);
            return (
              <div key={i} className="flex-1 flex flex-col items-center justify-end h-full" title={`${d.date}: ${formatDuration(d.timeSpentMs)}`}>
                <div className="w-full bg-[var(--brand)] rounded-t-md transition-all hover:bg-[var(--brand-dark)]" style={{ height: `${h}%`, minHeight: d.timeSpentMs > 0 ? 4 : 0 }} />
              </div>
            );
          })}
        </div>
      </section>

      {/* 備份（同步的 MVP 形式） */}
      <section className="card p-5 border-2 border-[var(--border)]">
        <h2 className="text-lg font-bold mb-2 flex items-center gap-2">
          <span>💾</span> 資料可攜備份與還原
        </h2>
        <p className="text-xs text-[var(--text-muted)] mb-4 leading-relaxed">
          系統採離線優先設計，資料均完整儲存於您的本機 IndexedDB。您可以隨時匯出 JSON 備份檔，
          以在其他裝置匯入還原，不被平台綁架。
        </p>
        <div className="flex gap-2.5">
          <button onClick={onExport} className="btn btn-primary px-4 py-2 text-xs font-bold">
            ⬇ 匯出完整備份
          </button>
          <button onClick={() => fileRef.current?.click()} className="btn btn-ghost px-4 py-2 text-xs font-bold">
            ⬆ 匯入備份還原
          </button>
          <input ref={fileRef} type="file" accept="application/json" onChange={onImport} className="hidden" />
        </div>
      </section>
    </main>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`card-soft p-4 border-2 transition-all ${highlight ? "border-emerald-300 bg-emerald-50/60 ring-2 ring-emerald-100" : "border-[var(--border)] bg-white"}`}>
      <div className="text-xs font-bold text-[var(--text-muted)] mb-1">{label}</div>
      <div className={`text-2xl font-black ${highlight ? "text-emerald-700" : "text-gray-900"}`}>{value}</div>
    </div>
  );
}