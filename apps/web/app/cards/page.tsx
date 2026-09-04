"use client";

import { useEffect, useState, useRef, useMemo } from "react";
import type { Card, Deck } from "@/lib/schemas";
import { listCards, listDecks, deleteCard, createDeck, deleteDeck } from "@/lib/db";
import CardEditor from "@/components/CardEditor";
import ReviewSession from "@/components/ReviewSession";
import { exportAll, importAll } from "@/lib/io/importExport";
import { playTts, defaultVoiceFor } from "@/lib/audio/tts";

type StateFilter = "all" | "due" | "new" | "learning" | "review" | "immersion";

export default function CardsPage() {
  const [decks, setDecks] = useState<Deck[]>([]);
  const [cards, setCards] = useState<Card[]>([]);
  const [selectedDeck, setSelectedDeck] = useState<string>("");
  const [editing, setEditing] = useState<Card | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [tagFilter, setTagFilter] = useState("");
  const [stateFilter, setStateFilter] = useState<StateFilter>("all");
  const [loading, setLoading] = useState(true);
  const [newDeckName, setNewDeckName] = useState("");
  const [newDeckLang, setNewDeckLang] = useState("es");
  const [showNewDeck, setShowNewDeck] = useState(false);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function refresh() {
    setLoading(true);
    const [ds, cs] = await Promise.all([listDecks(), listCards(selectedDeck || undefined)]);
    setDecks(ds);
    setCards(cs);
    setLoading(false);
  }

  useEffect(() => { refresh(); }, [selectedDeck]);

  const now = Date.now();

  const dueCount = useMemo(() => cards.filter(c => c.srs.due <= now).length, [cards, now]);
  const newCount = useMemo(() => cards.filter(c => c.srs.state === "new").length, [cards]);
  const learningCount = useMemo(() => cards.filter(c => c.srs.state === "learning" || c.srs.state === "relearning").length, [cards]);
  const reviewCount = useMemo(() => cards.filter(c => c.srs.state === "review").length, [cards]);
  const immersionCount = useMemo(() => cards.filter(c => c.cardType === "immersion").length, [cards]);

  const filtered = useMemo(() => {
    return cards.filter(c => {
      if (stateFilter === "due" && c.srs.due > now) return false;
      if (stateFilter === "new" && c.srs.state !== "new") return false;
      if (stateFilter === "learning" && c.srs.state !== "learning" && c.srs.state !== "relearning") return false;
      if (stateFilter === "review" && c.srs.state !== "review") return false;
      if (stateFilter === "immersion" && c.cardType !== "immersion") return false;
      if (tagFilter.trim() && !c.tags.some(t => t.toLowerCase().includes(tagFilter.toLowerCase()))) return false;
      return true;
    });
  }, [cards, stateFilter, tagFilter, now]);

  async function playCardAudio(c: Card) {
    if (playingId) return;
    setPlayingId(c.id);
    try {
      const voice = await defaultVoiceFor(c.lang) ?? c.lang;
      await playTts({ text: c.front, voice, lang: c.lang });
    } catch (err) {
      console.error(err);
    } finally {
      setTimeout(() => setPlayingId(null), 400);
    }
  }

  function startEdit(card: Card) {
    setEditing(card);
    setShowEditor(true);
  }
  function startNew() {
    setEditing(null);
    setShowEditor(true);
  }

  async function onDelete(card: Card) {
    if (!confirm(`確定刪除單字卡「${card.front}」？`)) return;
    await deleteCard(card.id);
    refresh();
  }

  async function onDeleteDeck() {
    if (!selectedDeck) return;
    const deck = decks.find(d => d.id === selectedDeck);
    if (!confirm(`確定刪除牌組「${deck?.name}」與其所有卡片？此操作無法復原。`)) return;
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
      alert(`成功匯入：${res.decks} 個牌組、${res.cards} 張卡片！`);
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
    <main className="space-y-6">
      {/* 標題與簡介 */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-extrabold flex items-center gap-2">
            <span>🎴</span> 單字卡中心
          </h1>
          <p className="text-[var(--text-muted)] text-sm mt-0.5">
            FSRS 精準間隔複習 · 離線優先儲存 · 支援發音試聽與例句
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setReviewing(true)}
            disabled={cards.length === 0}
            className="btn btn-primary px-5 shadow-sm flex items-center gap-1.5"
          >
            <span>▶</span>
            <span>開始複習</span>
            {dueCount > 0 && (
              <span className="bg-white text-[var(--brand-dark)] text-xs px-2 py-0.5 rounded-full font-black">
                {dueCount}
              </span>
            )}
          </button>

          <button
            onClick={startNew}
            disabled={decks.length === 0}
            className="btn btn-blue px-4 text-sm"
          >
            + 新增卡片
          </button>
        </div>
      </div>

      {/* 牌組導覽與操作條 */}
      <section className="card p-4 space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 flex-1 min-w-[260px]">
            <span className="text-sm font-bold text-[var(--text-muted)]">牌組：</span>
            <select
              value={selectedDeck}
              onChange={e => setSelectedDeck(e.target.value)}
              className="border-2 rounded-2xl px-3 py-2 flex-1 font-bold text-sm bg-white"
            >
              <option value="">📚 全部牌組 ({cards.length} 張卡片)</option>
              {decks.map(d => (
                <option key={d.id} value={d.id}>
                  {d.name} ({d.lang}) · {d.cardCount} 卡
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2 text-xs flex-wrap">
            <button
              onClick={() => setShowNewDeck(s => !s)}
              className="btn btn-ghost px-3 py-1.5 text-xs font-bold"
            >
              + 新牌組
            </button>
            {selectedDeck && (
              <button
                onClick={onDeleteDeck}
                className="btn btn-ghost px-3 py-1.5 text-xs font-bold"
                style={{ color: "var(--accent-pink)" }}
              >
                🗑 刪除牌組
              </button>
            )}
            <button onClick={onExport} className="btn btn-ghost px-3 py-1.5 text-xs">
              ⬇ 匯出備份
            </button>
            <button onClick={() => fileRef.current?.click()} className="btn btn-ghost px-3 py-1.5 text-xs">
              ⬆ 匯入備份
            </button>
            <input ref={fileRef} type="file" accept="application/json" onChange={onImportFile} className="hidden" />
          </div>
        </div>

        {/* 新增牌組展開面板 */}
        {showNewDeck && (
          <div className="flex gap-2 pt-2 border-t border-[var(--border)] items-center animate-pop">
            <input
              value={newDeckName}
              onChange={e => setNewDeckName(e.target.value)}
              placeholder="牌組名稱（例如：西文基礎 500、生活口語 100）"
              className="border-2 rounded-2xl px-3 py-1.5 flex-1 text-sm"
              autoFocus
            />
            <select
              value={newDeckLang}
              onChange={e => setNewDeckLang(e.target.value)}
              className="border-2 rounded-2xl px-3 py-1.5 text-sm font-bold bg-white"
            >
              {LANGS.map(l => <option key={l} value={l}>{l.toUpperCase()}</option>)}
            </select>
            <button onClick={addDeck} className="btn btn-primary px-4 py-1.5 text-xs font-bold">
              建立
            </button>
            <button onClick={() => setShowNewDeck(false)} className="btn btn-ghost px-3 py-1.5 text-xs">
              取消
            </button>
          </div>
        )}
      </section>

      {/* 狀態過濾標籤 + 搜尋 */}
      <section className="space-y-3">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
          {[
            { id: "all", label: "全部", count: cards.length },
            { id: "due", label: "待複習", count: dueCount, highlight: dueCount > 0 },
            { id: "new", label: "新卡", count: newCount },
            { id: "learning", label: "學習中", count: learningCount },
            { id: "review", label: "已熟練", count: reviewCount },
            { id: "immersion", label: "🎬 影片擷取", count: immersionCount },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setStateFilter(tab.id as StateFilter)}
              className={`px-3 py-1.5 rounded-full font-bold transition-all whitespace-nowrap flex items-center gap-1 ${
                stateFilter === tab.id
                  ? "bg-[var(--brand)] text-white shadow-xs"
                  : tab.highlight
                  ? "bg-amber-100 text-amber-900 hover:bg-amber-200"
                  : "bg-gray-100 text-[var(--text-muted)] hover:bg-gray-200"
              }`}
            >
              <span>{tab.label}</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                stateFilter === tab.id ? "bg-white text-[var(--brand-dark)]" : "bg-white/80"
              }`}>
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        <div className="relative">
          <input
            value={tagFilter}
            onChange={e => setTagFilter(e.target.value)}
            placeholder="🏷 依標籤過濾（例如：quick-add, food, verb）…"
            className="border-2 rounded-2xl px-4 py-2 w-full text-sm focus:ring-2 focus:ring-[var(--brand)] bg-white"
          />
          {tagFilter && (
            <button
              onClick={() => setTagFilter("")}
              className="absolute right-3 top-2.5 text-xs text-[var(--text-muted)] hover:text-gray-700"
            >
              ✕ 清除
            </button>
          )}
        </div>
      </section>

      {/* 卡片列表 */}
      {loading ? (
        <div className="card p-10 text-center text-[var(--text-muted)]">
          <div className="text-3xl animate-bounce-soft mb-2">⏳</div>
          載入單字卡資料庫中…
        </div>
      ) : decks.length === 0 ? (
        <div className="card p-10 text-center space-y-3">
          <div className="text-5xl">📦</div>
          <h3 className="text-xl font-bold">尚未建立任何牌組</h3>
          <p className="text-[var(--text-muted)] text-sm max-w-sm mx-auto">
            建立第一個學習牌組後，即可開始新增或從 YouTube 擷取單字卡！
          </p>
          <button onClick={() => setShowNewDeck(true)} className="btn btn-primary px-6">
            + 立即建立牌組
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="card p-10 text-center text-[var(--text-muted)] space-y-2">
          <div className="text-4xl">🔍</div>
          <div className="font-bold">沒有符合條件的卡片</div>
          <p className="text-xs">
            {tagFilter || stateFilter !== "all"
              ? "可嘗試切換過濾分頁或清除標籤搜尋"
              : "點擊右上角「+ 新增卡片」開始擴充字彙庫"}
          </p>
          {(tagFilter || stateFilter !== "all") && (
            <button
              onClick={() => { setStateFilter("all"); setTagFilter(""); }}
              className="btn btn-ghost px-4 py-1.5 text-xs font-bold mt-2"
            >
              重設所有過濾
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="text-xs text-[var(--text-muted)] px-1 font-semibold flex justify-between">
            <span>顯示 {filtered.length} 張卡片</span>
            <span>點擊 🔊 可直接試聽目標語發音</span>
          </div>

          <ul className="space-y-2.5">
            {filtered.map(c => {
              const deck = decks.find(d => d.id === c.deckId);
              const isDue = c.srs.due <= now;
              const stateLabels: Record<string, { label: string; color: string; bg: string }> = {
                new: { label: "新卡", color: "#64748b", bg: "#f1f5f9" },
                learning: { label: "學習中", color: "#ea580c", bg: "#ffedd5" },
                review: { label: "已熟練", color: "#16a34a", bg: "#dcfce7" },
                relearning: { label: "重學中", color: "#dc2626", bg: "#fee2e2" },
              };
              const stateInfo = stateLabels[c.srs.state] ?? { label: c.srs.state, color: "#64748b", bg: "#f1f5f9" };

              return (
                <li
                  key={c.id}
                  className="card p-4 flex items-start justify-between gap-3 hover:border-gray-300 transition-all animate-pop"
                >
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    {/* 直接發音按鈕 */}
                    <button
                      type="button"
                      onClick={() => playCardAudio(c)}
                      disabled={playingId === c.id}
                      title="朗讀發音"
                      className="btn-ghost btn p-2 rounded-2xl text-base w-10 h-10 flex items-center justify-center shrink-0 hover:scale-105 active:scale-95"
                    >
                      {playingId === c.id ? "🔉" : "🔊"}
                    </button>

                    <div className="flex-1 min-w-0">
                      {/* 正面與反面 */}
                      <div className="flex items-baseline gap-2 flex-wrap">
                        <span className="font-black text-xl text-[var(--text)]">{c.front}</span>
                        {c.ipa && (
                          <span className="text-sm font-semibold text-amber-600">/{c.ipa}/</span>
                        )}
                        {c.partOfSpeech && (
                          <span className="chip bg-blue-50 text-blue-700 text-xs font-bold">
                            {c.partOfSpeech}
                          </span>
                        )}
                        <span className="text-[var(--text-muted)]">→</span>
                        <span className="font-bold text-base text-[var(--brand-dark)]">{c.back}</span>
                      </div>

                      {/* 例句預覽 */}
                      {c.example && (
                        <div className="mt-1 text-xs italic text-[var(--text-muted)] bg-gray-50/80 p-2 rounded-xl">
                          <div>"{c.example}"</div>
                          {c.exampleTranslation && (
                            <div className="text-gray-500 font-normal">"{c.exampleTranslation}"</div>
                          )}
                        </div>
                      )}

                      {/* 標籤與狀態條 */}
                      <div className="text-xs text-[var(--text-muted)] mt-2 flex flex-wrap gap-1.5 items-center">
                        <span className="chip bg-gray-100 text-gray-700 font-semibold">{deck?.name ?? "預設"}</span>
                        {c.cardType === "immersion" && (
                          <span className="chip bg-purple-100 text-purple-700 font-bold">🎬 沉浸卡</span>
                        )}
                        <span
                          className="chip font-bold"
                          style={{ background: stateInfo.bg, color: stateInfo.color }}
                        >
                          {stateInfo.label} · 複習 {c.srs.reps} 次
                        </span>

                        {isDue ? (
                          <span className="chip bg-red-100 text-red-700 font-bold">
                            ⏰ 今日待複習
                          </span>
                        ) : (
                          <span className="chip bg-gray-100 text-gray-500">
                            📅 {new Date(c.srs.due).toLocaleDateString()} 到期
                          </span>
                        )}

                        {c.tags.map(t => (
                          <span key={t} className="chip bg-[var(--brand-light)] text-[var(--brand-dark)]">
                            #{t}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* 編輯與刪除 */}
                  <div className="flex gap-1 shrink-0 self-start">
                    <button
                      onClick={() => startEdit(c)}
                      className="btn-ghost btn px-3 py-1.5 text-xs font-bold"
                    >
                      ✏ 編輯
                    </button>
                    <button
                      onClick={() => onDelete(c)}
                      className="btn-ghost btn px-2.5 py-1.5 text-xs hover:bg-red-50"
                      style={{ color: "var(--accent-pink)" }}
                      title="刪除卡片"
                    >
                      🗑
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* 卡片編輯彈窗 */}
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
