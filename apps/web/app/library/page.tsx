"use client";

import { useEffect, useMemo, useState } from "react";
import { listCards, listDecks, getImageBlob, type ImageBlobRow } from "@/lib/db";
import type { Card, Deck } from "@/lib/schemas";

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
  const [decks, setDecks] = useState<Deck[]>([]);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [filterVideo, setFilterVideo] = useState<string | null>(null);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});

  async function refresh() {
    const [cs, ds] = await Promise.all([listCards(), listDecks()]);
    setCards(cs);
    setDecks(ds);
    try {
      const res = await fetch("/api/visit");
      const data = await res.json() as { visits: Visit[] };
      setVisits(data.visits ?? []);
    } catch { setVisits([]); }
  }

  useEffect(() => { refresh(); }, []);

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

  const videoCards = filterVideo ? (byVideo.get(filterVideo) ?? []) : immersion;
  const titleFor = (vid: string) => visits.find(v => v.videoId === vid)?.title;

  return (
    <main className="min-h-screen p-6 max-w-4xl mx-auto">
      <h1 className="text-3xl font-extrabold mb-4">📚 知識庫</h1>

      {/* 最近瀏覽影片 */}
      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">最近瀏覽影片</h2>
        {visits.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)]">尚無瀏覽紀錄。開 YouTube 影片並啟用擴充後會自動回報。</p>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {visits.slice(0, 12).map(v => {
              const hl = byVideo.get(v.videoId)?.length ?? 0;
              const active = filterVideo === v.videoId;
              return (
                <button
                  key={v.videoId}
                  onClick={() => setFilterVideo(active ? null : v.videoId)}
                  className={`text-left rounded-2xl overflow-hidden border-2 transition-all ${active ? "border-[var(--brand)] ring-2 ring-[var(--brand-light)]" : "border-[var(--border)] hover:border-[var(--brand)]"}`}
                >
                  <img src={thumb(v.videoId)} alt={v.title ?? v.videoId} className="w-full aspect-video object-cover" loading="lazy" />
                  <div className="p-2">
                    <div className="text-sm font-bold line-clamp-2">{v.title ?? v.videoId}</div>
                    <div className="text-xs text-[var(--text-muted)] mt-1">
                      {timeAgo(v.lastSeen)} · 瀏覽 {v.visitCount} 次 · {hl > 0 ? `🎬 ${hl} 個 highlight` : "未擷取"}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </section>

      {/* highlight 單字／句子 */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xl font-semibold">
            我的 highlight
            {filterVideo && (
              <span className="text-sm font-normal text-[var(--text-muted)] ml-2">
                · 篩選：{titleFor(filterVideo) ?? filterVideo}
                <button onClick={() => setFilterVideo(null)} className="ml-2 text-[var(--accent-blue)] underline">清除</button>
              </span>
            )}
          </h2>
          <span className="text-xs text-[var(--text-muted)]">{videoCards.length} 項</span>
        </div>

        {videoCards.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)]">
            尚未擷取任何單字／句子。在 YouTube 影片字幕上點單字即可加入這裡。
          </p>
        ) : (
          <div className="space-y-3">
            {videoCards.map(c => (
              <div key={c.id} className="border rounded-2xl p-3 flex gap-3">
                {thumbs[c.id] ? (
                  <img src={thumbs[c.id]} alt="截圖" className="w-28 aspect-video object-cover rounded-lg shrink-0" />
                ) : (
                  <div className="w-28 aspect-video bg-gray-100 rounded-lg shrink-0 flex items-center justify-center text-2xl">🎬</div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span className="text-xl font-extrabold">{c.front}</span>
                    <span className="text-[var(--text-muted)]">→</span>
                    <span className="text-lg font-bold text-[var(--brand-dark)]">{c.back || "（無譯文）"}</span>
                  </div>
                  {c.example && (
                    <div className="mt-1">
                      <div className="text-sm italic">"{c.example}"</div>
                      {c.exampleTranslation && <div className="text-xs text-[var(--text-muted)]">"{c.exampleTranslation}"</div>}
                    </div>
                  )}
                  <div className="mt-2 flex items-center gap-3 text-xs text-[var(--text-muted)] flex-wrap">
                    <span>#{c.lang}</span>
                    {c.tags.filter(t => t !== "immersion" && t !== "youtube").map(t => <span key={t}>#{t}</span>)}
                    {c.context && (
                      <a href={watchUrl(c.context.videoId, c.context.startSec)} target="_blank" rel="noreferrer" className="text-[var(--accent-blue)] underline">
                        ▶ {Math.floor(c.context.startSec / 60)}:{String(c.context.startSec % 60).padStart(2, "0")} 重看
                      </a>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}