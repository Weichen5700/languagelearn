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
        <Stat label="🃏 總卡片" value={String(stats.totalCards)} />
        <Stat label="📌 今日到期" value={String(stats.dueToday)} highlight />
        <Stat label="✅ 累計複習" value={String(stats.totalReviews)} />
        <Stat label="🔥 連續天數" value={`${stats.streak} 天`} />
        <Stat label="⏱ 總學習時長" value={formatDuration(stats.totalTimeSpentMs)} />
        <Stat label="📅 上次複習" value={stats.lastReviewDate ?? "—"} />
        <Stat label="🎬 沉浸卡" value={`${stats.immersionCards}${stats.totalCards ? ` (${Math.round(stats.immersionCards / stats.totalCards * 100)}%)` : ""}`} />
      </section>

      {/* 沉浸式學習來源占比 */}
      {stats.immersionCards > 0 && (
        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3">沉浸式學習占比</h2>
          <div className="flex items-center gap-2">
            <div className="w-24 text-sm">🎬 影片擷取</div>
            <div className="flex-1 bg-gray-100 rounded h-5 overflow-hidden">
              <div className="bg-purple-500 h-5" style={{ width: `${Math.round(stats.immersionCards / (stats.totalCards || 1) * 100)}%` }} />
            </div>
            <div className="w-20 text-sm text-right">{stats.immersionCards} / {stats.totalCards}</div>
          </div>
          <p className="text-xs text-[var(--text-muted)] mt-2">從 YouTube 字幕點擊擷取、帶語境的單字卡占比。</p>
        </section>
      )}

      {/* 熱力圖 */}
      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">複習熱力圖（最近 12 週）</h2>
        <div className="flex gap-1 overflow-x-auto pb-2">
          {weeks.map((col, wi) => (
            <div key={wi} className="flex flex-col gap-1">
              {col.map((d, di) => (
                <div
                  key={di}
                  title={`${d.date}: ${d.count} 次`}
                  className={`w-3 h-3 rounded-sm heat-cell ${heatColor(d.count)}`}
                />
              ))}
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2 text-xs text-[var(--text-muted)] mt-2">
          <span>少</span>
          <div className="w-3 h-3 rounded-sm bg-gray-100" />
          <div className="w-3 h-3 rounded-sm bg-green-200" />
          <div className="w-3 h-3 rounded-sm bg-green-400" />
          <div className="w-3 h-3 rounded-sm bg-green-600" />
          <div className="w-3 h-3 rounded-sm bg-green-800" />
          <span>多</span>
        </div>
      </section>

      {/* 卡片狀態分布 */}
      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">卡片熟練度分布</h2>
        <div className="space-y-2">
          {(Object.keys(STATE_COLORS) as (keyof StateDistribution)[]).map(k => {
            const v = stats.stateDist[k];
            const pct = Math.round((v / totalStates) * 100);
            return (
              <div key={k} className="flex items-center gap-2">
                <div className="w-20 text-sm">{STATE_LABELS[k]}</div>
                <div className="flex-1 bg-gray-100 rounded h-5 overflow-hidden">
                  <div className={`${STATE_COLORS[k]} h-5`} style={{ width: `${pct}%` }} />
                </div>
                <div className="w-16 text-sm text-right">{v} ({pct}%)</div>
              </div>
            );
          })}
        </div>
      </section>

      {/* 每日學習時長（最近 14 天） */}
      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">每日學習時長（最近 14 天）</h2>
        <div className="flex items-end gap-1 h-32">
          {stats.daily.slice(-14).map((d, i) => {
            const maxMs = Math.max(1, ...stats.daily.slice(-14).map(x => x.timeSpentMs));
            const h = Math.round((d.timeSpentMs / maxMs) * 100);
            return (
              <div key={i} className="flex-1 flex flex-col items-center justify-end" title={`${d.date}: ${formatDuration(d.timeSpentMs)}`}>
                <div className="w-full bg-blue-500 rounded-t" style={{ height: `${h}%`, minHeight: d.timeSpentMs > 0 ? 2 : 0 }} />
              </div>
            );
          })}
        </div>
      </section>

      {/* 備份（同步的 MVP 形式） */}
      <section className="border-t pt-6">
        <h2 className="text-xl font-semibold mb-2">資料備份</h2>
        <p className="text-sm text-gray-600 mb-3">
          雲端同步為未來工作（NextAuth + Postgres）。目前以 JSON 匯出/匯入實現可攜帶性：
          匯出後可到另一台裝置匯入。
        </p>
        <div className="flex gap-2">
          <button onClick={onExport} className="border px-4 py-2 rounded">⬇ 匯出備份</button>
          <button onClick={() => fileRef.current?.click()} className="border px-4 py-2 rounded">⬆ 匯入備份</button>
          <input ref={fileRef} type="file" accept="application/json" onChange={onImport} className="hidden" />
        </div>
      </section>
    </main>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`border rounded p-3 ${highlight ? "border-blue-500 bg-blue-50" : ""}`}>
      <div className="text-xs text-gray-500">{label}</div>
      <div className="text-2xl font-bold">{value}</div>
    </div>
  );
}