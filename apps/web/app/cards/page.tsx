"use client";

import { useEffect, useState, useRef } from "react";
import type { Card, Deck } from "@/lib/schemas";
import { listCards, listDecks, deleteCard, createDeck, deleteDeck } from "@/lib/db";
import CardEditor from "@/components/CardEditor";
import ReviewSession from "@/components/ReviewSession";
import { exportAll, importAll } from "@/lib/io/importExport";

export default function CardsPage() {
  const [decks, setDecks] = useState<Deck[]>([]);
  const [cards, setCards] = useState<Card[]>([]);
  const [selectedDeck, setSelectedDeck] = useState<string>("");
  const [editing, setEditing] = useState<Card | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [tagFilter, setTagFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [newDeckName, setNewDeckName] = useState("");
  const [newDeckLang, setNewDeckLang] = useState("es");
  const [showNewDeck, setShowNewDeck] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function refresh() {
    setLoading(true);
    const [ds, cs] = await Promise.all([listDecks(), listCards(selectedDeck || undefined)]);
    setDecks(ds);
    setCards(cs);
    setLoading(false);
  }

  useEffect(() => { refresh(); }, [selectedDeck]);

  const filtered = tagFilter.trim()
    ? cards.filter(c => c.tags.some(t => t.toLowerCase().includes(tagFilter.toLowerCase())))
    : cards;

  function startEdit(card: Card) {
    setEditing(card);
    setShowEditor(true);
  }
  function startNew() {
    setEditing(null);
    setShowEditor(true);
  }

  async function onDelete(card: Card) {
    if (!confirm(`刪除「${card.front}」？`)) return;
    await deleteCard(card.id);
    refresh();
  }

  async function onDeleteDeck() {
    if (!selectedDeck) return;
    const deck = decks.find(d => d.id === selectedDeck);
    if (!confirm(`刪除牌組「${deck?.name}」與其所有卡片？`)) return;
    await deleteDeck(selectedDeck);
    setSelectedDeck("");
    refresh();
  }

  async function addDeck() {
    if (!newDeckName.trim()) return;
    const deck: Deck = {
      id: crypto.randomUUID(),
      name: newDeckName.trim(),
      lang: newDeckLang,
      cardCount: 0,
    };
    await createDeck(deck);
    setNewDeckName("");
    setShowNewDeck(false);
    refresh();
  }

  async function onExport() {
    const json = await exportAll();
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `flashcards-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function onImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    try {
      const res = await importAll(text);
      alert(`匯入：${res.decks} 牌組、${res.cards} 卡片`);
      refresh();
    } catch (err) {
      alert(`匯入失敗：${err instanceof Error ? err.message : err}`);
    }
    e.target.value = "";
  }

  if (reviewing) {
    return <ReviewSession deckId={selectedDeck || undefined} onExit={() => { setReviewing(false); refresh(); }} />;
  }

  const LANGS = ["es", "en", "zh", "ja", "ko", "fr", "de"];

  return (
    <main className="space-y-5">
      <div>
        <h1 className="text-3xl font-extrabold flex items-center gap-2">🎴 單字卡</h1>
        <p className="text-[var(--text-muted)] text-sm">FSRS 間隔複習 · 離線儲存 · 鍵盤流複習</p>
      </div>

      {/* 牌組選擇 */}
      <section>
        <div className="flex gap-2 mb-3 flex-wrap">
          <select value={selectedDeck} onChange={e => setSelectedDeck(e.target.value)} className="border-2 rounded-2xl px-3 py-2 flex-1 min-w-[200px] font-bold">
            <option value="">📚 全部牌組</option>
            {decks.map(d => <option key={d.id} value={d.id}>{d.name} ({d.lang}) · {d.cardCount} 卡</option>)}
          </select>
          <button onClick={startNew} disabled={decks.length === 0} className="btn btn-blue">+ 新增卡片</button>
          <button onClick={() => setReviewing(true)} disabled={cards.length === 0} className="btn btn-primary">▶ 開始複習</button>
        </div>
        <div className="flex gap-2 text-sm flex-wrap">
          <button onClick={() => setShowNewDeck(s => !s)} className="btn-ghost btn px-3 py-1.5 text-sm">+ 新牌組</button>
          {selectedDeck && <button onClick={onDeleteDeck} className="btn-ghost btn px-3 py-1.5 text-sm" style={{ color: "var(--accent-pink)" }}>🗑 刪除牌組</button>}
          <button onClick={onExport} className="btn-ghost btn px-3 py-1.5 text-sm">⬇ 匯出</button>
          <button onClick={() => fileRef.current?.click()} className="btn-ghost btn px-3 py-1.5 text-sm">⬆ 匯入</button>
          <input ref={fileRef} type="file" accept="application/json" onChange={onImportFile} className="hidden" />
        </div>
        {showNewDeck && (
          <div className="flex gap-2 mt-3">
            <input value={newDeckName} onChange={e => setNewDeckName(e.target.value)} placeholder="牌組名稱（如 西文基礎 500）" className="border-2 rounded-2xl px-3 py-1.5 flex-1" />
            <select value={newDeckLang} onChange={e => setNewDeckLang(e.target.value)} className="border-2 rounded-2xl px-3 py-1.5">
              {LANGS.map(l => <option key={l} value={l}>{l}</option>)}
            </select>
            <button onClick={addDeck} className="btn btn-blue px-3 py-1.5 text-sm">建立</button>
          </div>
        )}
      </section>

      {/* 篩選 */}
      <div>
        <input value={tagFilter} onChange={e => setTagFilter(e.target.value)} placeholder="🏷 依標籤過濾…" className="border-2 rounded-2xl px-3 py-2 w-full" />
      </div>

      {/* 卡片列表 */}
      {loading ? (
        <p className="text-[var(--text-muted)]">⏳ 載入中…</p>
      ) : decks.length === 0 ? (
        <div className="card p-8 text-center text-[var(--text-muted)]">
          <div className="text-4xl mb-2">📦</div>
          先建立一個牌組才能新增卡片。
        </div>
      ) : filtered.length === 0 ? (
        <div className="card p-8 text-center text-[var(--text-muted)]">
          <div className="text-4xl mb-2">🔍</div>
          沒有符合的卡片。
        </div>
      ) : (
        <ul className="space-y-2">
          {filtered.map(c => {
            const deck = decks.find(d => d.id === c.deckId);
            const stateColors: Record<string, string> = {
              new: "var(--text-muted)", learning: "var(--accent-orange)",
              review: "var(--brand)", relearning: "var(--accent-pink)",
            };
            return (
              <li key={c.id} className="card p-3 flex items-start justify-between gap-3 animate-pop">
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-lg">{c.front} <span className="text-[var(--text-muted)] font-normal">→ {c.back}</span></div>
                  <div className="text-xs text-[var(--text-muted)] mt-1 flex flex-wrap gap-1 items-center">
                    <span className="chip" style={{ background: "var(--bg)" }}>{deck?.name}</span>
                    <span className="chip" style={{ background: "var(--bg)" }}>{c.cardType}</span>
                    <span className="chip" style={{ background: stateColors[c.srs.state] + "22", color: stateColors[c.srs.state] }}>
                      {c.srs.state} · reps {c.srs.reps}
                    </span>
                    <span className="chip" style={{ background: "var(--bg)" }}>到期 {new Date(c.srs.due || 0).toLocaleDateString()}</span>
                    {c.tags.map(t => <span key={t} className="chip" style={{ background: "var(--brand-light)", color: "var(--brand-dark)" }}>#{t}</span>)}
                  </div>
                </div>
                <div className="flex gap-2 text-sm shrink-0">
                  <button onClick={() => startEdit(c)} className="btn-ghost btn px-3 py-1.5 text-sm">✏ 編輯</button>
                  <button onClick={() => onDelete(c)} className="btn-ghost btn px-3 py-1.5 text-sm" style={{ color: "var(--accent-pink)" }}>🗑</button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {showEditor && (
        <CardEditor
          decks={decks}
          initial={editing}
          defaultDeckId={selectedDeck || undefined}
          onSaved={() => { setShowEditor(false); setEditing(null); refresh(); }}
          onCancel={() => { setShowEditor(false); setEditing(null); }}
        />
      )}
    </main>
  );
}