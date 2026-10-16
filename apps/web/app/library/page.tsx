"use client";

import { useEffect, useMemo, useState } from "react";
import { listCards, getImageBlob, type ImageBlobRow } from "@/lib/db";
import type { Card } from "@/lib/schemas";
import { playTts, defaultVoiceFor } from "@/lib/audio/tts";

interface Visit {
  videoId: string;
  title?: string;
  source: string;
  visitCount: number;
  firstSeen: number;
  lastSeen: number;
}

function thumb(videoId: string): string {
  return `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
}
function watchUrl(videoId: string, startSec?: number): string {
  return startSec != null
    ? `https://www.youtube.com/watch?v=${videoId}&t=${startSec}s`
    : `https://www.youtube.com/watch?v=${videoId}`;
}
function timeAgo(ts: number): string {
  const d = Math.floor((Date.now() - ts) / 1000);
  if (d < 60) return "剛剛";
  if (d < 3600) return `${Math.floor(d / 60)} 分鐘前`;
  if (d < 86400) return `${Math.floor(d / 3600)} 小時前`;
  return `${Math.floor(d / 86400)} 天前`;
}

export default function LibraryPage() {
  const [cards, setCards] = useState<Card[]>([]);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [filterVideo, setFilterVideo] = useState<string | null>(null);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [zoomImg, setZoomImg] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [playingId, setPlayingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const cs = await listCards();
      if (cancelled) return;
      setCards(cs);
      try {
        const res = await fetch("/api/visit");
        const data = await res.json() as { visits: Visit[] };
        if (!cancelled) setVisits(data.visits ?? []);
      } catch {
        if (!cancelled) setVisits([]);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // 沉浸卡（highlight）依 videoId 分組
  const immersion = useMemo(() => cards.filter(c => c.cardType === "immersion"), [cards]);
  const byVideo = useMemo(() => {
    const m = new Map<string, Card[]>();
    for (const c of immersion) {
      const vid = c.context?.videoId ?? "(無來源)";
      if (!m.has(vid)) m.set(vid, []);
      m.get(vid)!.push(c);
    }
    return m;
  }, [immersion]);

  // 載入各 highlight 卡的截圖（objectURL）
  useEffect(() => {
    const urls: Record<string, string> = {};
    let alive = true;
    (async () => {
      for (const c of immersion) {
        const id = c.media.imageId;
        if (!id) continue;
        const row: ImageBlobRow | undefined = await getImageBlob(id);
        if (row && alive) urls[c.id] = URL.createObjectURL(row.blob);
      }
      if (alive) setThumbs(urls);
    })();
    return () => { alive = false; Object.values(urls).forEach(u => URL.revokeObjectURL(u)); };
  }, [immersion]);

  async function playAudio(c: Card) {
    if (playingId) return;
    setPlayingId(c.id);
    try {
      const voice = await defaultVoiceFor(c.lang) ?? c.lang;
      await playTts({ text: c.front, voice, lang: c.lang });
    } catch (e) {
      console.error(e);
    } finally {
      setTimeout(() => setPlayingId(null), 400);
    }
  }

  const baseCards = useMemo(
    () => (filterVideo ? (byVideo.get(filterVideo) ?? []) : immersion),
    [filterVideo, byVideo, immersion]
  );

  const videoCards = useMemo(() => {
    if (!searchQuery.trim()) return baseCards;
    const q = searchQuery.toLowerCase();
    return baseCards.filter(c =>
      c.front.toLowerCase().includes(q) ||
      c.back.toLowerCase().includes(q) ||
      (c.example && c.example.toLowerCase().includes(q)) ||
      c.tags.some(t => t.toLowerCase().includes(q))
    );
  }, [baseCards, searchQuery]);

  const titleFor = (vid: string) => visits.find(v => v.videoId === vid)?.title;

  return (
    <main className="min-h-screen max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-3xl font-extrabold flex items-center gap-2">
            <span>📚</span> 知識庫與影片高光
          </h1>
          <p className="text-[var(--text-muted)] text-sm mt-0.5">
            YouTube 影片沉浸式截圖、字幕點擊擷取、原聲與語境紀錄
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="chip bg-purple-100 text-purple-800 font-bold px-3 py-1">
            🎬 共 {immersion.length} 條高光
          </span>
          <span className="chip bg-blue-100 text-blue-800 font-bold px-3 py-1">
            🎥 {visits.length} 部影片
          </span>
        </div>
      </div>

      {/* 最近瀏覽影片 */}
      <section className="card p-5">
        <h2 className="text-xl font-bold mb-3 flex items-center gap-2">
          <span>🎥</span> 影片來源一覽
        </h2>
        {visits.length === 0 ? (
          <div className="text-center py-6 text-[var(--text-muted)] space-y-1">
            <div className="text-3xl">🎬</div>
            <p className="text-sm font-medium">尚無影片紀錄</p>
            <p className="text-xs">
              開啟任何 YouTube 影片並透過 Chrome 擴充套件點擊字幕，就會自動收錄在此處。
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {visits.slice(0, 12).map(v => {
              const hl = byVideo.get(v.videoId)?.length ?? 0;
              const active = filterVideo === v.videoId;
              return (
                <button
                  key={v.videoId}
                  onClick={() => setFilterVideo(active ? null : v.videoId)}
                  className={`text-left rounded-2xl overflow-hidden border-2 transition-all cursor-pointer ${
                    active
                      ? "border-[var(--brand)] ring-2 ring-[var(--brand-light)] scale-101"
                      : "border-[var(--border)] hover:border-gray-400 bg-white"
                  }`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- YouTube 縮圖 CDN，此處為 lazy 縮圖牆無 LCP 影響 */}
                  <img src={thumb(v.videoId)} alt={v.title ?? v.videoId} className="w-full aspect-video object-cover" loading="lazy" />
                  <div className="p-2.5">
                    <div className="text-xs font-bold line-clamp-2 leading-tight">{v.title ?? v.videoId}</div>
                    <div className="text-[11px] text-[var(--text-muted)] mt-1 flex items-center justify-between">
                      <span>{timeAgo(v.lastSeen)}</span>
                      <span className={`font-bold ${hl > 0 ? "text-purple-600" : ""}`}>
                        {hl > 0 ? `🎬 ${hl} 條` : "未擷取"}
                      </span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </section>

      {/* highlight 單字／句子列表 */}
      <section className="space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <span>🔖</span> 沉浸單字與語境
            {filterVideo && (
              <span className="text-xs font-normal text-[var(--text-muted)] flex items-center gap-1">
                <span>· 篩選影片：</span>
                <span className="font-bold text-gray-800 truncate max-w-[200px]">{titleFor(filterVideo) ?? filterVideo}</span>
                <button onClick={() => setFilterVideo(null)} className="text-[var(--accent-blue)] underline font-bold ml-1">
                  ✕ 清除篩選
                </button>
              </span>
            )}
          </h2>
          <span className="text-xs text-[var(--text-muted)] font-semibold">{videoCards.length} 項高光</span>
        </div>

        {/* 關鍵字快速過濾 */}
        <div className="relative">
          <input
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="🔍 搜尋已擷取的單字、釋義或例句…"
            className="w-full border-2 rounded-2xl px-4 py-2 text-sm bg-white focus:ring-2 focus:ring-[var(--brand)]"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-2.5 text-xs text-[var(--text-muted)] hover:text-gray-700"
            >
              ✕ 清除
            </button>
          )}
        </div>

        {videoCards.length === 0 ? (
          <div className="card p-10 text-center text-[var(--text-muted)] space-y-2">
            <div className="text-4xl">🎬</div>
            <p className="font-bold">尚未找到任何高光單字或句子</p>
            <p className="text-xs">
              在 YouTube 觀看影片時，點選雙語字幕的單字，即可一鍵加入沉浸知識庫並進行 FSRS 間隔複習！
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {videoCards.map(c => (
              <div key={c.id} className="card p-4 flex flex-col sm:flex-row gap-3 hover:border-gray-300 transition-all animate-pop">
                {thumbs[c.id] ? (
                  // eslint-disable-next-line @next/next/no-img-element -- IndexedDB blob: objectURL，next/image 無法最佳化
                  <img
                    src={thumbs[c.id]}
                    alt="截圖（點擊放大）"
                    onClick={() => setZoomImg(thumbs[c.id]!)}
                    className="w-full sm:w-36 aspect-video object-cover rounded-xl shrink-0 cursor-zoom-in hover:opacity-85 transition-opacity border border-gray-200"
                  />
                ) : (
                  <div className="w-full sm:w-36 aspect-video bg-gray-100 rounded-xl shrink-0 flex items-center justify-center text-3xl">
                    🎬
                  </div>
                )}

                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <button
                      onClick={() => playAudio(c)}
                      disabled={playingId === c.id}
                      title="發音試聽"
                      className="btn-ghost btn p-1.5 rounded-xl text-sm w-7 h-7 inline-flex items-center justify-center align-middle hover:scale-110"
                    >
                      {playingId === c.id ? "🔉" : "🔊"}
                    </button>
                    <span className="text-xl font-black text-gray-900">{c.front}</span>
                    {c.ipa && <span className="text-sm font-semibold text-amber-600">/{c.ipa}/</span>}
                    {c.partOfSpeech && (
                      <span className="chip bg-blue-50 text-blue-700 text-xs">{c.partOfSpeech}</span>
                    )}
                    <span className="text-[var(--text-muted)]">→</span>
                    <span className="text-base font-bold text-[var(--brand-dark)]">{c.back || "（無譯文）"}</span>
                  </div>

                  {c.definitions && c.definitions.length > 0 && (
                    <ul className="mt-1.5 text-xs text-[var(--text-muted)] list-disc pl-5">
                      {c.definitions.slice(0, 2).map((d, i) => <li key={i}>{d}</li>)}
                    </ul>
                  )}

                  {c.dictExamples && c.dictExamples.length > 0 && (
                    <div className="mt-1 text-xs italic text-[var(--text-muted)] space-y-0.5">
                      {c.dictExamples.slice(0, 1).map((ex, i) => <div key={i}>例：{ex}</div>)}
                    </div>
                  )}

                  {c.example && (
                    <div className="mt-1.5 bg-gray-50/80 p-2 rounded-xl text-xs">
                      <div className="italic text-gray-800">&quot;{c.example}&quot;</div>
                      {c.exampleTranslation && <div className="text-gray-500 font-normal mt-0.5">&quot;{c.exampleTranslation}&quot;</div>}
                    </div>
                  )}

                  <div className="mt-2.5 flex items-center gap-3 text-xs text-[var(--text-muted)] flex-wrap">
                    <span className="chip bg-gray-100 font-bold">#{c.lang.toUpperCase()}</span>
                    {c.tags.filter(t => t !== "immersion" && t !== "youtube").map(t => (
                      <span key={t} className="chip bg-[var(--brand-light)] text-[var(--brand-dark)]">#{t}</span>
                    ))}
                    {c.context && (
                      <a
                        href={watchUrl(c.context.videoId, c.context.startSec)}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[var(--accent-blue)] hover:underline font-bold flex items-center gap-1 ml-auto"
                      >
                        <span>▶</span>
                        <span>{Math.floor(c.context.startSec / 60)}:{String(c.context.startSec % 60).padStart(2, "0")} 重看影片原句</span>
                      </a>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 截圖放大 lightbox */}
      {zoomImg && (
        <div
          className="fixed inset-0 bg-black/85 backdrop-blur-xs flex items-center justify-center p-6 z-50 cursor-zoom-out"
          onClick={() => setZoomImg(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- blob: objectURL 放大檢視，next/image 無法最佳化 */}
          <img src={zoomImg} alt="放大截圖" className="max-w-[92vw] max-h-[88vh] rounded-2xl border border-white/20 shadow-2xl animate-pop" />
          <button
            onClick={() => setZoomImg(null)}
            className="absolute top-5 right-6 w-10 h-10 rounded-full bg-white/20 text-white text-2xl flex items-center justify-center hover:bg-white/30"
          >
            ×
          </button>
        </div>
      )}
    </main>
  );
}
