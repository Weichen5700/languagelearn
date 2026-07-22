"use client";

import { useEffect, useState, useCallback } from "react";
import type { Plan, PlanTask, Card, Deck } from "@/lib/schemas";
import { listPlans, savePlan, deletePlan, listCards, listDecks } from "@/lib/db";
import { computeProgress, dayNumberOf, todayTask, distributeCards, todayCards } from "@/lib/plan/progress";

const LANGS = ["es", "en", "zh", "ja", "ko", "fr", "de"];

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function PlansPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [cards, setCards] = useState<Card[]>([]);
  const [decks, setDecks] = useState<Deck[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [showNew, setShowNew] = useState(false);
  const [reviewingToday, setReviewingToday] = useState(false);
  const [todayCardList, setTodayCardList] = useState<Card[]>([]);

  const refresh = useCallback(async () => {
    const [ps, cs, ds] = await Promise.all([listPlans(), listCards(), listDecks()]);
    setPlans(ps.sort((a, b) => a.startDate - b.startDate));
    setCards(cs);
    setDecks(ds);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  async function startTodayReview() {
    // 聚合所有進行中計畫的今日卡片
    const all: Card[] = [];
    for (const p of plans) {
      const ts = await todayCards(p);
      all.push(...ts);
    }
    // 去重
    const seen = new Set<string>();
    const unique = all.filter(c => seen.has(c.id) ? false : (seen.add(c.id), true));
    setTodayCardList(unique);
    setReviewingToday(true);
  }

  if (reviewingToday) {
    // 用臨時 deckId=undefined 但注入 todayCardList：透過自訂 onExit
    // 簡化：ReviewSession 接受 deckId；這裡改用一個內聯元件顯示今日卡
    return <TodayReview cards={todayCardList} onExit={() => { setReviewingToday(false); refresh(); }} />;
  }

  return (
    <main className="min-h-screen p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-extrabold flex items-center gap-2">📅 學習計畫</h1>
          <p className="text-[var(--text-muted)] text-sm">課程進度 / 每日任務 / 今日複習</p>
        </div>
      </div>

      <div className="flex gap-2 mb-6">
        <button onClick={startTodayReview} disabled={plans.length === 0} className="btn btn-primary">📅 今日任務複習</button>
        <button onClick={() => setShowNew(true)} className="btn btn-blue">+ 新增計畫</button>
      </div>

      {plans.length === 0 ? (
        <div className="card p-8 text-center text-[var(--text-muted)]">
          <div className="text-4xl mb-2">📋</div>
          尚無計畫。建立一個計畫把卡片分配到每天。
        </div>
      ) : (
        <ul className="space-y-3">
          {plans.map(p => {
            const day = dayNumberOf(p);
            const today = todayTask(p);
            const progress = computeProgress(p);
            return (
              <li key={p.id} className={`card p-4 animate-pop ${selectedId === p.id ? "" : ""}`} style={selectedId === p.id ? { borderColor: "var(--accent-blue)" } : undefined}>
                <div className="flex justify-between items-start cursor-pointer" onClick={() => setSelectedId(selectedId === p.id ? "" : p.id)}>
                  <div className="flex-1">
                    <div className="font-bold text-lg">{p.title} <span className="text-[var(--text-muted)] text-sm">({p.lang})</span></div>
                    {p.goal && <div className="text-sm text-[var(--text-muted)]">🎯 {p.goal}</div>}
                    <div className="text-xs text-[var(--text-muted)] mt-1">
                      起始 {new Date(p.startDate).toLocaleDateString()} · 第 {day} 天 · 今日 {today?.cardIds.length ?? 0} 卡
                    </div>
                    <div className="mt-2 bg-[var(--border)] rounded-full h-3 overflow-hidden">
                      <div className="bg-[var(--brand)] h-3 rounded-full transition-all" style={{ width: `${progress}%` }} />
                    </div>
                    <div className="text-xs text-[var(--text-muted)] mt-1">進度 {progress}%</div>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); if (confirm(`刪除計畫「${p.title}」？`)) { deletePlan(p.id).then(refresh); } }}
                    className="btn-ghost btn px-3 py-1 text-sm"
                    style={{ color: "var(--accent-pink)" }}
                  >🗑</button>
                </div>

                {selectedId === p.id && (
                  <PlanDetail plan={p} cards={cards} onChanged={refresh} />
                )}
              </li>
            );
          })}
        </ul>
      )}

      {showNew && (
        <NewPlanModal
          decks={decks}
          cards={cards}
          onSaved={async (plan) => { await savePlan(plan); setShowNew(false); refresh(); setSelectedId(plan.id); }}
          onCancel={() => setShowNew(false)}
        />
      )}
    </main>
  );
}

function PlanDetail({ plan, cards, onChanged }: { plan: Plan; cards: Card[]; onChanged: () => void }) {
  const [assignDay, setAssignDay] = useState(1);
  const [assignCardId, setAssignCardId] = useState("");

  async function toggleDone(task: PlanTask) {
    const updated: Plan = {
      ...plan,
      tasks: plan.tasks.map(t => t.day === task.day ? { ...t, done: !t.done } : t),
    };
    updated.progress = computeProgress(updated);
    await savePlan(updated);
    onChanged();
  }

  async function addCardToDay(day: number, cardId: string) {
    if (!cardId) return;
    const updated: Plan = {
      ...plan,
      tasks: plan.tasks.map(t => t.day === day && !t.cardIds.includes(cardId)
        ? { ...t, cardIds: [...t.cardIds, cardId] } : t),
    };
    await savePlan(updated);
    onChanged();
    setAssignCardId("");
  }

  async function removeCardFromDay(day: number, cardId: string) {
    const updated: Plan = {
      ...plan,
      tasks: plan.tasks.map(t => t.day === day
        ? { ...t, cardIds: t.cardIds.filter(id => id !== cardId) } : t),
    };
    await savePlan(updated);
    onChanged();
  }

  const today = dayNumberOf(plan);
  const cardById = (id: string) => cards.find(c => c.id === id);
  const unassigned = cards.filter(c => !plan.tasks.some(t => t.cardIds.includes(c.id)));

  return (
    <div className="mt-4 border-t pt-4">
      <h3 className="font-semibold mb-2">每日任務</h3>
      <div className="space-y-2 max-h-96 overflow-y-auto">
        {plan.tasks.map(t => (
          <div key={t.day} className={`border rounded p-2 ${t.day === today ? "bg-blue-50 border-blue-300" : ""}`}>
            <div className="flex justify-between items-center">
              <span className="font-medium">第 {t.day} 天 {t.day === today ? "（今日）" : ""}</span>
              <button onClick={() => toggleDone(t)} className={`text-xs px-2 py-0.5 rounded ${t.done ? "bg-green-600 text-white" : "border"}`}>
                {t.done ? "✓ 完成" : "標記完成"}
              </button>
            </div>
            {t.cardIds.length === 0 ? (
              <div className="text-xs text-gray-400 mt-1">無卡片</div>
            ) : (
              <ul className="mt-1 text-sm">
                {t.cardIds.map(id => {
                  const c = cardById(id);
                  return (
                    <li key={id} className="flex justify-between">
                      <span>{c ? `${c.front} → ${c.back}` : `(已刪除 ${id.slice(0, 6)})`}</span>
                      <button onClick={() => removeCardFromDay(t.day, id)} className="text-red-600 text-xs">×</button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        ))}
      </div>

      {/* 指派卡片到某天 */}
      <div className="mt-4 flex gap-2 items-end">
        <div>
          <label className="text-xs text-gray-500">第幾天</label>
          <input type="number" min={1} value={assignDay} onChange={e => setAssignDay(Number(e.target.value))} className="border rounded px-2 py-1 w-20" />
        </div>
        <div className="flex-1">
          <label className="text-xs text-gray-500">未指派的卡片</label>
          <select value={assignCardId} onChange={e => setAssignCardId(e.target.value)} className="border rounded px-2 py-1 w-full">
            <option value="">選擇卡片…</option>
            {unassigned.map(c => <option key={c.id} value={c.id}>{c.front} → {c.back}</option>)}
          </select>
        </div>
        <button onClick={() => addCardToDay(assignDay, assignCardId)} disabled={!assignCardId} className="bg-blue-600 text-white px-3 py-1 rounded disabled:opacity-50">加入</button>
      </div>
    </div>
  );
}

function NewPlanModal({ decks, cards, onSaved, onCancel }: { decks: Deck[]; cards: Card[]; onSaved: (p: Plan) => void; onCancel: () => void }) {
  const [title, setTitle] = useState("");
  const [lang, setLang] = useState("es");
  const [goal, setGoal] = useState("");
  const [startDate, setStartDate] = useState(todayStr());
  const [days, setDays] = useState(7);
  const [deckId, setDeckId] = useState("");

  function create() {
    if (!title.trim()) return;
    const start = new Date(startDate + "T00:00:00").getTime();
    const deckCards = deckId ? cards.filter(c => c.deckId === deckId) : cards;
    const tasks = distributeCards(deckCards.map(c => c.id), days);
    const plan: Plan = {
      id: crypto.randomUUID(),
      title: title.trim(),
      lang,
      goal: goal.trim() || undefined,
      startDate: start,
      tasks,
      progress: 0,
    };
    onSaved(plan);
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" onClick={onCancel}>
      <div className="bg-white rounded-lg p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
        <h2 className="text-xl font-bold mb-4">新增計畫</h2>
        <div className="space-y-3">
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="計畫名稱（如 西文 30 天衝刺）" className="w-full border rounded px-3 py-2" />
          <div className="flex gap-2">
            <select value={lang} onChange={e => setLang(e.target.value)} className="border rounded px-2 py-1">
              {LANGS.map(l => <option key={l} value={l}>{l}</option>)}
            </select>
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="border rounded px-2 py-1 flex-1" />
          </div>
          <input value={goal} onChange={e => setGoal(e.target.value)} placeholder="目標（可選，如 通過 DELE A1）" className="w-full border rounded px-3 py-2" />
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="text-xs text-gray-500">分配天數</label>
              <input type="number" min={1} max={365} value={days} onChange={e => setDays(Number(e.target.value))} className="border rounded px-2 py-1 w-full" />
            </div>
            <div className="flex-1">
              <label className="text-xs text-gray-500">來源牌組（可選）</label>
              <select value={deckId} onChange={e => setDeckId(e.target.value)} className="border rounded px-2 py-1 w-full">
                <option value="">全部卡片</option>
                {decks.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
          </div>
          <p className="text-xs text-gray-500">
            {deckId ? `將從「${decks.find(d => d.id === deckId)?.name}」牌組 ` : "將全部卡片 "}
            的 {cards.filter(c => !deckId || c.deckId === deckId).length} 張卡片平均分配到 {days} 天
          </p>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onCancel} className="px-4 py-2 border rounded">取消</button>
          <button onClick={create} disabled={!title.trim()} className="px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-50">建立</button>
        </div>
      </div>
    </div>
  );
}

/** 今日任務複習：限定於今日計畫卡片。 */
function TodayReview({ cards, onExit }: { cards: Card[]; onExit: () => void }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-8">
      <div className="text-center max-w-md">
        <h2 className="text-2xl font-bold mb-4">📅 今日任務</h2>
        {cards.length === 0 ? (
          <p className="text-gray-600 mb-4">今天沒有排定的計畫卡片。去 /cards 自由複習到期卡吧！</p>
        ) : (
          <>
            <p className="text-gray-600 mb-4">今日共 {cards.length} 張計畫卡片：</p>
            <ul className="text-left mb-4 max-h-60 overflow-y-auto border rounded p-3">
              {cards.map(c => <li key={c.id} className="text-sm">{c.front} → {c.back}</li>)}
            </ul>
            <p className="text-xs text-gray-500 mb-4">提示：前往 /cards 的「開始複習」會自動包含今日到期卡 + 計畫今日卡（透過 FSRS 佇列交錯）。</p>
          </>
        )}
        <button onClick={onExit} className="px-6 py-2 bg-blue-600 text-white rounded">返回計畫</button>
      </div>
    </div>
  );
}