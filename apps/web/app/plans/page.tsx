"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
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
    <main className="min-h-screen max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-extrabold flex items-center gap-2">
            <span>📅</span> 學習進度計畫
          </h1>
          <p className="text-[var(--text-muted)] text-sm mt-0.5">
            週期衝刺 · 每日任務分配 · 系統性累積字彙量
          </p>
        </div>

        <div className="flex gap-2">
          <Link href="/cards/review" className="btn btn-primary px-5 text-sm">
            📅 今日任務複習
          </Link>
          <button onClick={() => setShowNew(true)} className="btn btn-blue px-4 text-sm">
            + 新增計畫
          </button>
        </div>
      </div>

      {plans.length === 0 ? (
        <div className="card p-10 text-center space-y-3">
          <div className="text-5xl">📋</div>
          <h3 className="text-xl font-bold">目前尚無排程計畫</h3>
          <p className="text-[var(--text-muted)] text-sm max-w-sm mx-auto">
            建立一個學習衝刺計畫（例如：西文 14 天基礎單字突破），系統會自動將牌組卡片分配到每一天！
          </p>
          <button onClick={() => setShowNew(true)} className="btn btn-primary px-6">
            + 建立第一個計畫
          </button>
        </div>
      ) : (
        <ul className="space-y-4">
          {plans.map(p => {
            const day = dayNumberOf(p);
            const today = todayTask(p);
            const progress = computeProgress(p);
            const isSelected = selectedId === p.id;
            return (
              <li
                key={p.id}
                className={`card p-5 transition-all animate-pop ${
                  isSelected ? "ring-2 ring-[var(--accent-blue)] border-transparent shadow-md" : "hover:border-gray-300"
                }`}
              >
                <div
                  className="flex justify-between items-start cursor-pointer gap-3"
                  onClick={() => setSelectedId(isSelected ? "" : p.id)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-black text-xl text-gray-900">{p.title}</span>
                      <span className="chip bg-blue-100 text-blue-800 font-bold text-xs">{p.lang.toUpperCase()}</span>
                      {p.goal && (
                        <span className="text-xs text-[var(--text-muted)] font-medium">🎯 {p.goal}</span>
                      )}
                    </div>

                    <div className="text-xs text-[var(--text-muted)] mt-1.5 flex items-center gap-3 flex-wrap font-medium">
                      <span>起始日：{new Date(p.startDate).toLocaleDateString()}</span>
                      <span>·</span>
                      <span className="font-bold text-gray-800">當前第 {day} 天</span>
                      <span>·</span>
                      <span className="font-bold text-[var(--brand-dark)]">今日任務：{today?.cardIds.length ?? 0} 張卡片</span>
                    </div>

                    <div className="mt-3">
                      <div className="flex justify-between text-xs font-bold mb-1">
                        <span className="text-[var(--text-muted)]">整體完成進度</span>
                        <span className="text-[var(--brand-dark)]">{progress}%</span>
                      </div>
                      <div className="w-full bg-gray-100 rounded-full h-3 overflow-hidden border border-gray-200">
                        <div
                          className="bg-[var(--brand)] h-3 rounded-full transition-all duration-500"
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs font-bold text-[var(--accent-blue)]">
                      {isSelected ? "收起細節 ▲" : "展開細節 ▼"}
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm(`確定刪除計畫「${p.title}」？此操作不會刪除原本的單字卡。`)) {
                          deletePlan(p.id).then(refresh);
                        }
                      }}
                      className="btn-ghost btn p-1.5 rounded-xl text-xs hover:bg-red-50 text-[var(--accent-pink)]"
                      title="刪除計畫"
                    >
                      🗑
                    </button>
                  </div>
                </div>

                {isSelected && (
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
    <div className="mt-5 border-t border-[var(--border)] pt-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-sm text-gray-800">每日排程清單</h3>
        <span className="text-xs text-[var(--text-muted)]">點擊標記狀態，可自由調整任務卡片</span>
      </div>

      <div className="space-y-2.5 max-h-96 overflow-y-auto pr-1">
        {plan.tasks.map(t => {
          const isToday = t.day === today;
          return (
            <div
              key={t.day}
              className={`rounded-2xl p-3 border-2 transition-all ${
                isToday
                  ? "bg-blue-50/70 border-[var(--accent-blue)]"
                  : t.done
                  ? "bg-green-50/40 border-green-200"
                  : "bg-white border-gray-100"
              }`}
            >
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-sm">
                    第 {t.day} 天
                  </span>
                  {isToday && (
                    <span className="chip bg-[var(--accent-blue)] text-white text-[10px] font-bold">
                      今日任務
                    </span>
                  )}
                  <span className="text-xs text-[var(--text-muted)]">
                    ({t.cardIds.length} 張卡片)
                  </span>
                </div>

                <button
                  onClick={() => toggleDone(t)}
                  className={`btn px-3 py-1 text-xs font-bold rounded-xl ${
                    t.done
                      ? "btn-primary"
                      : "btn-ghost"
                  }`}
                >
                  {t.done ? "✓ 已完成" : "標記為完成"}
                </button>
              </div>

              {t.cardIds.length === 0 ? (
                <div className="text-xs text-gray-400 mt-1 italic">未分配卡片</div>
              ) : (
                <ul className="mt-2 text-xs space-y-1 bg-white/70 p-2 rounded-xl border border-gray-100">
                  {t.cardIds.map(id => {
                    const c = cardById(id);
                    return (
                      <li key={id} className="flex justify-between items-center py-0.5">
                        <span className="font-medium text-gray-800 truncate">
                          {c ? `${c.front} → ${c.back}` : `(卡片已移除)`}
                        </span>
                        <button
                          onClick={() => removeCardFromDay(t.day, id)}
                          className="text-red-500 hover:text-red-700 font-bold px-1"
                          title="從這天移除"
                        >
                          ✕
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}
      </div>

      {/* 指派卡片到某天 */}
      <div className="bg-gray-50 p-3 rounded-2xl border border-gray-200 flex gap-2 items-end flex-wrap">
        <div>
          <label className="text-xs font-bold text-[var(--text-muted)] block mb-1">指定天數</label>
          <input
            type="number"
            min={1}
            value={assignDay}
            onChange={e => setAssignDay(Number(e.target.value))}
            className="border-2 rounded-xl px-2 py-1.5 w-20 text-sm bg-white font-bold"
          />
        </div>
        <div className="flex-1 min-w-[200px]">
          <label className="text-xs font-bold text-[var(--text-muted)] block mb-1">未排程卡片</label>
          <select
            value={assignCardId}
            onChange={e => setAssignCardId(e.target.value)}
            className="w-full border-2 rounded-xl px-3 py-1.5 text-sm bg-white font-medium"
          >
            <option value="">請選擇要加入的卡片…</option>
            {unassigned.map(c => <option key={c.id} value={c.id}>{c.front} → {c.back}</option>)}
          </select>
        </div>
        <button
          onClick={() => addCardToDay(assignDay, assignCardId)}
          disabled={!assignCardId}
          className="btn btn-primary px-4 py-1.5 text-xs font-bold"
        >
          ＋ 加入至當日
        </button>
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
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50" onClick={onCancel}>
      <div className="bg-white rounded-3xl p-6 w-full max-w-md shadow-2xl border-2 border-[var(--border)] animate-pop" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-extrabold">📅 建立學習新計畫</h2>
          <button onClick={onCancel} className="text-[var(--text-muted)] hover:text-gray-800 text-lg w-8 h-8 rounded-full flex items-center justify-center hover:bg-gray-100">
            ✕
          </button>
        </div>

        <div className="space-y-3.5">
          <div>
            <label className="text-xs font-bold text-[var(--text-muted)] mb-1 block">計畫名稱 *</label>
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="例如：西文 14 天基礎生活衝刺"
              className="w-full border-2 rounded-2xl px-3 py-2 text-sm font-bold bg-white"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs font-bold text-[var(--text-muted)] mb-1 block">目標語言</label>
              <select value={lang} onChange={e => setLang(e.target.value)} className="w-full border-2 rounded-2xl px-3 py-2 text-sm font-semibold bg-white">
                {LANGS.map(l => <option key={l} value={l}>{l.toUpperCase()}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-bold text-[var(--text-muted)] mb-1 block">開始日期</label>
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-full border-2 rounded-2xl px-3 py-2 text-sm bg-white font-semibold" />
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-[var(--text-muted)] mb-1 block">學習目標（可選）</label>
            <input
              value={goal}
              onChange={e => setGoal(e.target.value)}
              placeholder="例如：通過 DELE A1、看懂西班牙影集…"
              className="w-full border-2 rounded-2xl px-3 py-2 text-sm bg-white"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs font-bold text-[var(--text-muted)] mb-1 block">分配天數 (天)</label>
              <input type="number" min={1} max={365} value={days} onChange={e => setDays(Number(e.target.value))} className="w-full border-2 rounded-2xl px-3 py-2 text-sm font-bold bg-white" />
            </div>
            <div>
              <label className="text-xs font-bold text-[var(--text-muted)] mb-1 block">來源牌組</label>
              <select value={deckId} onChange={e => setDeckId(e.target.value)} className="w-full border-2 rounded-2xl px-3 py-2 text-sm font-semibold bg-white">
                <option value="">全部牌組卡片</option>
                {decks.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
          </div>

          <p className="text-xs text-[var(--text-muted)] bg-gray-50 p-2.5 rounded-xl border border-gray-200 leading-relaxed">
            系統將從 {deckId ? `「${decks.find(d => d.id === deckId)?.name}」` : "所有"} 卡片庫（共 {cards.filter(c => !deckId || c.deckId === deckId).length} 張），平均分配到 {days} 天的每日任務中。
          </p>
        </div>

        <div className="flex justify-end gap-2.5 mt-6 pt-3 border-t border-[var(--border)]">
          <button onClick={onCancel} className="btn btn-ghost px-4 py-2 text-sm">取消</button>
          <button onClick={create} disabled={!title.trim()} className="btn btn-primary px-6 py-2 text-sm shadow-sm">
            ✓ 建立計畫
          </button>
        </div>
      </div>
    </div>
  );
}

function TodayReview({ cards, onExit }: { cards: Card[]; onExit: () => void }) {
  const [idx, setIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const current = cards[idx];

  if (cards.length === 0) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center p-6">
        <div className="card p-8 text-center max-w-md w-full space-y-4 animate-pop">
          <div className="text-5xl">🎉</div>
          <h2 className="text-2xl font-black">今日計畫卡片已全數完成！</h2>
          <p className="text-sm text-[var(--text-muted)]">今天沒有排定待學的計畫卡片。您可以前往單字卡中心自由複習到期卡。</p>
          <div className="flex gap-2 justify-center">
            <button onClick={onExit} className="btn btn-ghost">返回計畫</button>
            <Link href="/cards/review" className="btn btn-primary">前往到期複習</Link>
          </div>
        </div>
      </div>
    );
  }

  if (idx >= cards.length) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center p-6">
        <div className="card p-8 text-center max-w-md w-full space-y-4 animate-pop">
          <div className="text-6xl animate-bounce-soft">🌟</div>
          <h2 className="text-2xl font-black">今日計畫卡片瀏覽完成！</h2>
          <p className="text-sm text-[var(--text-muted)]">共瀏覽了 {cards.length} 張今日計畫卡片。</p>
          <div className="flex gap-2 justify-center">
            <button onClick={onExit} className="btn btn-ghost">返回計畫</button>
            <Link href="/cards/review" className="btn btn-primary">前往 FSRS 間隔複習</Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center max-w-xl mx-auto p-4 space-y-4">
      <div className="flex justify-between items-center w-full text-xs font-bold text-[var(--text-muted)]">
        <span>📅 今日計畫卡片 ({idx + 1} / {cards.length})</span>
        <button onClick={onExit} className="btn-ghost btn px-2.5 py-1 text-xs">✕ 結束離開</button>
      </div>

      <div
        onClick={() => setFlipped(f => !f)}
        className="card p-8 w-full min-h-[260px] flex flex-col items-center justify-center text-center cursor-pointer hover:border-gray-300 transition-all animate-pop shadow-md"
      >
        {!flipped ? (
          <div className="space-y-2">
            <div className="text-3xl font-black text-gray-900">{current.front}</div>
            {current.ipa && <div className="text-sm font-semibold text-amber-600">/{current.ipa}/</div>}
            <div className="text-xs text-[var(--text-muted)] pt-3">點擊翻面查看釋義</div>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="text-2xl font-black text-[var(--brand-dark)]">{current.back}</div>
            {current.example && (
              <div className="text-xs italic text-[var(--text-muted)] mt-2 bg-gray-50 p-2 rounded-xl">
                "{current.example}"
              </div>
            )}
            <div className="text-xs text-[var(--text-muted)] pt-2">點擊翻回正面</div>
          </div>
        )}
      </div>

      <div className="flex justify-between w-full">
        <button
          onClick={() => { setIdx(i => Math.max(0, i - 1)); setFlipped(false); }}
          disabled={idx === 0}
          className="btn btn-ghost px-4 py-2 text-xs"
        >
          ← 上一張
        </button>
        <button
          onClick={() => { setIdx(i => i + 1); setFlipped(false); }}
          className="btn btn-primary px-6 py-2 text-xs font-bold"
        >
          {idx === cards.length - 1 ? "完成 ✓" : "下一張 →"}
        </button>
      </div>
    </div>
  );
}