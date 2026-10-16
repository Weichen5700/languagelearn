"use client";

import { useState, useEffect } from "react";
import { buildReviewQueue, gradeCard } from "@/lib/review/queue";
import { playTts, defaultVoiceFor } from "@/lib/audio/tts";
import { getImageBlob } from "@/lib/db";
import type { Card } from "@/lib/schemas";
import type { Rating } from "@/lib/srs";
import YouTubePlayer from "./YouTubePlayer";
import TtsSpeedControl from "./TtsSpeedControl";

interface Props {
  deckId?: string;
  onExit: () => void;
}

const RATING_BUTTONS: { r: Rating; label: string; sub: string; key: string; color: string }[] = [
  { r: 1, label: "Again", sub: "忘記/重來", key: "1", color: "var(--rate-again)" },
  { r: 2, label: "Hard", sub: "生疏/困難", key: "2", color: "var(--rate-hard)" },
  { r: 3, label: "Good", sub: "記得/良好", key: "3", color: "var(--rate-good)" },
  { r: 4, label: "Easy", sub: "熟悉/簡單", key: "4", color: "var(--rate-easy)" },
];


export default function ReviewSession({ deckId, onExit }: Props) {
  const [queue, setQueue] = useState<Card[]>([]);
  const [idx, setIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [done, setDone] = useState(false);
  const [stats, setStats] = useState({ reviewed: 0, again: 0 });
  const [cardStart, setCardStart] = useState(() => Date.now());
  const [history, setHistory] = useState<{ card: Card; rating: Rating }[]>([]);
  const [speaking, setSpeaking] = useState(false);
  const [toast, setToast] = useState<{ msg: string; kind: "info" | "error" } | null>(null);
  const [replayIdx, setReplayIdx] = useState<number | null>(null);
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const [zoomImg, setZoomImg] = useState<string | null>(null);

  function flashToast(msg: string, kind: "info" | "error" = "info") {
    setToast({ msg, kind });
    setTimeout(() => setToast(null), 2500);
  }

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const items = await buildReviewQueue(deckId);
      if (cancelled) return;
      setQueue(items.map(i => i.card));
      setIdx(0);
      setFlipped(false);
      setDone(items.length === 0);
      setCardStart(Date.now());
    })();
    return () => { cancelled = true; };
  }, [deckId]);

  const current = queue[idx];
  // 換卡即自動收合「重看這句」（衍生值，不需 effect 內 setState）
  const showReplay = replayIdx === idx;

  // 沉浸卡截圖：依 media.imageId 載入 IndexedDB 影格並產生 objectURL
  useEffect(() => {
    let url: string | null = null;
    let alive = true;
    (async () => {
      const id = current?.media.imageId;
      if (!id) { if (alive) setImgUrl(null); return; }
      const row = await getImageBlob(id);
      if (row && alive) { url = URL.createObjectURL(row.blob); setImgUrl(url); }
      else if (alive) setImgUrl(null);
    })();
    return () => { alive = false; if (url) URL.revokeObjectURL(url); };
  }, [current?.media.imageId, idx]);

  async function speak(text?: string) {
    if (!current || speaking) return;
    setSpeaking(true);
    flashToast("🔊 合成語音中…", "info");
    try {
      const lang = current.lang;
      const voice = await defaultVoiceFor(lang) ?? lang;
      await playTts({ text: text ?? current.front, voice, lang });
      flashToast("▶ 播放中…", "info");
    } catch (e) {
      flashToast(`❌ ${e instanceof Error ? e.message : "發音失敗"}`, "error");
    } finally {
      setTimeout(() => setSpeaking(false), 500);
    }
  }

  async function rate(r: Rating) {
    if (!current || !flipped) return;
    const timeSpent = Date.now() - cardStart;
    try {
      const updated = await gradeCard(current, r, timeSpent);
      setHistory(h => [...h, { card: updated, rating: r }]);
      setStats(s => ({ reviewed: s.reviewed + 1, again: s.again + (r === 1 ? 1 : 0) }));
      const nextIdx = idx + 1;
      if (nextIdx >= queue.length) {
        setDone(true);
      } else {
        setIdx(nextIdx);
        setFlipped(false);
        setCardStart(Date.now());
      }
    } catch (e) {
      flashToast(`❌ 儲存失敗：${e instanceof Error ? e.message : e}`, "error");
    }
  }

  function undo() {
    if (history.length === 0) return;
    const last = history[history.length - 1];
    // 還原：把卡重新插回當前位置（簡化：往前一張）
    setHistory(h => h.slice(0, -1));
    setStats(s => ({ reviewed: Math.max(0, s.reviewed - 1), again: Math.max(0, s.again - (last.rating === 1 ? 1 : 0)) }));
    setIdx(i => Math.max(0, i - 1));
    setFlipped(false);
    setCardStart(Date.now());
  }

  // 鍵盤流：Space 翻卡、1-4 評分、u undo、s 發音、Esc 離開
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === " ") { e.preventDefault(); setFlipped(f => !f); }
      else if (e.key === "s" || e.key === "S") speak();
      else if (e.key === "u" || e.key === "U") undo();
      else if (e.key === "Escape") onExit();
      else if (flipped && ["1", "2", "3", "4"].includes(e.key)) rate(Number(e.key) as Rating);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (done) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center animate-pop">
          <div className="text-7xl mb-3 animate-bounce-soft">🎉</div>
          <h2 className="text-3xl font-extrabold mb-2">今日複習完成！</h2>
          <p className="text-[var(--text-muted)] mb-6">共複習 {stats.reviewed} 張，答錯 {stats.again} 張</p>
          <button onClick={onExit} className="btn btn-primary">↩ 返回</button>
        </div>
      </div>
    );
  }

  if (!current) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center">
          <div className="text-6xl mb-3">🌱</div>
          <p className="text-[var(--text-muted)] mb-6">目前沒有待複習的卡片</p>
          <button onClick={onExit} className="btn btn-ghost">↩ 返回</button>
        </div>
      </div>
    );
  }

  const progress = Math.round((idx / queue.length) * 100);

  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center relative">
      {/* 浮動 toast */}
      {toast && (
        <div
          className="fixed top-20 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-2xl font-bold text-white animate-pop shadow-lg"
          style={{ background: toast.kind === "error" ? "var(--accent-pink)" : "var(--accent-blue)" }}
        >
          {toast.msg}
        </div>
      )}
      <div className="w-full max-w-2xl">
        <div className="flex justify-between text-sm text-[var(--text-muted)] mb-2 font-bold">
          <span>📋 {idx + 1} / {queue.length} · 已複習 {stats.reviewed}</span>
          <button onClick={onExit} className="btn-ghost btn px-3 py-1 text-sm">✕ 離開 (Esc)</button>
        </div>
        {/* 進度條 */}
        <div className="h-3 rounded-full bg-[var(--border)] mb-4 overflow-hidden">
          <div className="h-3 rounded-full bg-[var(--brand)] transition-all" style={{ width: `${progress}%` }} />
        </div>

        {/* 卡片 */}
        <div
          className={`card p-8 min-h-[280px] flex flex-col items-center justify-center cursor-pointer ${flipped ? "animate-flip" : "animate-pop"}`}
          onClick={() => setFlipped(f => !f)}
          style={{ borderColor: flipped ? "var(--accent-blue)" : "var(--border)" }}
        >
          {!flipped ? (
            <>
              <div className="text-4xl font-extrabold mb-3 text-center">{current.front}</div>
              {current.ipa && <div className="text-[var(--text-muted)] text-lg">/{current.ipa}/</div>}
              {current.partOfSpeech && (
                <div className="text-xs text-[var(--accent-blue)] font-bold italic mt-1">{current.partOfSpeech}</div>
              )}
              {current.definitions && current.definitions.length > 0 && (
                <ul className="mt-2 text-sm text-[var(--text-muted)] list-disc pl-5 text-left max-w-md">
                  {current.definitions.slice(0, 3).map((d, i) => <li key={i}>{d}</li>)}
                </ul>
              )}
              {current.cardType === "cloze" && current.clozeText && (
                <div className="text-[var(--text)] mt-3 text-center">{current.clozeText}</div>
              )}
              <button
                onClick={(e) => { e.stopPropagation(); speak(); }}
                disabled={speaking}
                className="btn btn-ghost mt-4 px-3 py-1.5 text-sm"
              >
                {speaking ? "🔊…" : "🔊 發音 (s)"}
              </button>
              {current.example && (
                <button
                  onClick={(e) => { e.stopPropagation(); speak(current.example); }}
                  disabled={speaking}
                  className="btn btn-ghost mt-2 px-3 py-1.5 text-sm"
                >
                  {speaking ? "🔊…" : "🔊 整句發音"}
                </button>
              )}
              {current.context && (
                <button
                  onClick={(e) => { e.stopPropagation(); setReplayIdx(p => (p === idx ? null : idx)); }}
                  className="btn btn-ghost mt-2 px-3 py-1.5 text-sm"
                >
                  ▶ 重看這句（影片 {Math.floor(current.context.startSec / 60)}:{String(current.context.startSec % 60).padStart(2, "0")}）
                </button>
              )}
              <div className="text-xs text-[var(--text-muted)] mt-3">點擊或按 Space 翻面</div>
            </>
          ) : (
            <>
              <div className="text-4xl font-extrabold mb-3 text-center">{current.back}</div>
              {current.context?.lines && current.context.lines.length > 0 ? (
                <div className="mt-3 text-center space-y-1 max-w-xl">
                  {current.context.lines.map((l, i) => (
                    <div key={i} className="text-[var(--text)] italic">
                      <span className="text-xs text-[var(--text-muted)] mr-1">{Math.floor(l.startSec / 60)}:{String(l.startSec % 60).padStart(2, "0")}</span>
                      &quot;{l.text}&quot;
                    </div>
                  ))}
                  {current.exampleTranslation && (
                    <div className="text-[var(--text-muted)] text-sm pt-1 border-t mt-1">譯：{current.exampleTranslation}</div>
                  )}
                </div>
              ) : current.example && (
                <div className="mt-3 text-center space-y-1">
                  <div className="text-[var(--text)] italic">&quot;{current.example}&quot;</div>
                  {current.exampleTranslation && (
                    <div className="text-[var(--text-muted)] text-sm">&quot;{current.exampleTranslation}&quot;</div>
                  )}
                </div>
              )}
              {current.dictExamples && current.dictExamples.length > 0 && (
                <div className="mt-3 text-center text-xs text-[var(--text-muted)] space-y-0.5">
                  {current.dictExamples.slice(0, 2).map((ex, i) => <div key={i} className="italic">字典例：{ex}</div>)}
                </div>
              )}
              <div className="flex gap-1 mt-4 flex-wrap justify-center">
                {current.tags.map(t => (
                  <span key={t} className="chip" style={{ background: "var(--brand-light)", color: "var(--brand-dark)" }}>#{t}</span>
                ))}
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); speak(current.front); }}
                disabled={speaking}
                className="btn btn-ghost mt-4 px-3 py-1.5 text-sm"
              >
                {speaking ? "🔊…" : "🔊 重聽發音 (s)"}
              </button>
              {current.example && (
                <button
                  onClick={(e) => { e.stopPropagation(); speak(current.example); }}
                  disabled={speaking}
                  className="btn btn-ghost mt-2 px-3 py-1.5 text-sm"
                >
                  {speaking ? "🔊…" : "🔊 整句發音"}
                </button>
              )}
              {current.context && (
                <button
                  onClick={(e) => { e.stopPropagation(); setReplayIdx(p => (p === idx ? null : idx)); }}
                  className="btn btn-ghost mt-2 px-3 py-1.5 text-sm"
                >
                  ▶ 重看這句（{Math.floor(current.context.startSec / 60)}:{String(current.context.startSec % 60).padStart(2, "0")}）
                </button>
              )}
            </>
          )}
        </div>

        {/* 重看這句：截圖 + YouTube 播放器（可調語速，跳到擷取時間） */}
        {current.context && showReplay && (
          <div className="mt-4 space-y-3">
            {imgUrl && (
              // eslint-disable-next-line @next/next/no-img-element -- IndexedDB blob: objectURL，next/image 無法最佳化
              <img
                src={imgUrl}
                alt="擷取當下的影片影格（點擊放大）"
                onClick={() => setZoomImg(imgUrl)}
                className="w-full rounded-2xl border-2 border-[var(--border)] cursor-zoom-in hover:opacity-85 transition-opacity"
              />
            )}
            <YouTubePlayer
              videoId={current.context.videoId}
              startSec={current.context.startSec}
              endSec={
                current.context.lines && current.context.lines.length > 1
                  ? current.context.lines[current.context.lines.length - 1].startSec + 4
                  : undefined
              }
            />
          </div>
        )}

        {/* 翻面提示或評分按鈕 */}
        {!flipped ? (
          <div
            onClick={() => setFlipped(true)}
            className="card p-4 mt-6 text-center text-sm font-bold text-[var(--accent-blue)] bg-blue-50/70 border-2 border-blue-200 cursor-pointer hover:bg-blue-100/70 transition-colors animate-pop flex items-center justify-center gap-2"
          >
            <span>💡</span>
            <span>點擊卡片或按 <kbd className="px-2 py-0.5 bg-white border rounded shadow-xs font-mono text-xs">Space</kbd> 翻開卡片以進行評分</span>
          </div>
        ) : (
          <div className="grid grid-cols-4 gap-2.5 mt-6 animate-pop">
            {RATING_BUTTONS.map(b => (
              <button
                key={b.r}
                onClick={() => rate(b.r)}
                className="btn text-white py-2.5 flex flex-col items-center justify-center transition-transform hover:scale-102 active:scale-95"
                style={{ background: b.color }}
              >
                <div className="font-black text-base">{b.label}</div>
                <div className="text-[11px] opacity-90 font-medium">{b.sub}</div>
                <div className="text-[10px] opacity-75 font-mono">[{b.key}]</div>
              </button>
            ))}
          </div>
        )}

        <div className="flex justify-between items-center mt-4 text-xs text-[var(--text-muted)]">
          <button onClick={undo} disabled={history.length === 0} className="btn-ghost btn px-3 py-1 text-xs disabled:opacity-30">
            ↩ 復原 (u)
          </button>
          <span className="self-center hidden sm:inline">Space 翻面 · 1-4 評分 · s 朗讀 · u 復原 · Esc 退出</span>
          <TtsSpeedControl compact />
        </div>
      </div>

      {/* 截圖放大 lightbox */}
      {zoomImg && (
        <div
          className="fixed inset-0 bg-black/85 flex items-center justify-center p-6 z-50 cursor-zoom-out"
          onClick={() => setZoomImg(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- blob: objectURL 放大檢視，next/image 無法最佳化 */}
          <img src={zoomImg} alt="放大截圖" className="max-w-[92vw] max-h-[88vh] rounded-2xl border border-white/20 shadow-2xl" />
          <button
            onClick={() => setZoomImg(null)}
            className="absolute top-5 right-6 w-10 h-10 rounded-full bg-white/15 text-white text-2xl flex items-center justify-center hover:bg-white/25"
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
}