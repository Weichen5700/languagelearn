"use client";

import { useEffect, useRef, useState } from "react";
import { loadSettings, saveSettings, type Settings } from "@/lib/store/settings";

/**
 * YouTube 重看播放器：用 IFrame Player API 控制，可調語速（setPlaybackRate）。
 * 用於沉浸卡「重看這句」——比純 iframe 多了語速控制，符合外語學習需求。
 */

declare global {
  interface Window {
    YT?: any;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let apiPromise: Promise<void> | null = null;
function loadApi(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.YT?.Player) return Promise.resolve();
  if (apiPromise) return apiPromise;
  apiPromise = new Promise((resolve) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => { prev?.(); resolve(); };
    const s = document.createElement("script");
    s.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(s);
  });
  return apiPromise;
}

const COMMON_RATES = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

interface Props {
  videoId: string;
  startSec: number;
  endSec?: number;          // 片段循環終點（A-B loop）；未提供時用 start+6
}

export default function YouTubePlayer({ videoId, startSec, endSec }: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<any>(null);
  const [rate, setRate] = useState<number>(1);
  const [available, setAvailable] = useState<number[]>(COMMON_RATES);
  const [ready, setReady] = useState(false);
  const [looping, setLooping] = useState(false);
  const loopRef = useRef<{ start: number; end: number; timer: number | null } | null>(null);

  useEffect(() => { setRate(loadSettings().ytRate); }, []);

  const loopEnd = endSec ?? startSec + 6;

  useEffect(() => {
    let cancelled = false;
    loadApi().then(() => {
      if (cancelled || !hostRef.current || !window.YT?.Player) return;
      playerRef.current = new window.YT.Player(hostRef.current, {
        videoId,
        playerVars: {
          start: Math.max(0, Math.floor(startSec)),
          autoplay: 1,
          mute: 1,            // 多數瀏覽器要求自動播放先靜音，可手動開聲
          rel: 0,
          playsinline: 1,
        },
        events: {
          onReady: () => {
            if (cancelled) return;
            setReady(true);
            try {
              const rates = playerRef.current.getAvailablePlaybackRates() as number[];
              if (rates?.length) setAvailable(rates);
            } catch { /* use COMMON_RATES */ }
            try {
              const target = loadSettings().ytRate;
              playerRef.current.setPlaybackRate(target);
              setRate(target);
            } catch { /* ignore */ }
          },
        },
      });
    });
    return () => {
      cancelled = true;
      try { playerRef.current?.destroy?.(); } catch { /* ignore */ }
      playerRef.current = null;
    };
  }, [videoId, startSec]);

  function setRateAndSave(r: number) {
    setRate(r);
    saveSettings({ ...loadSettings(), ytRate: r } as Settings);
    try { playerRef.current?.setPlaybackRate?.(r); } catch { /* not ready */ }
  }

  // ---- A-B 片段循環 ----
  function stopLoopTimer() {
    if (loopRef.current?.timer) { clearInterval(loopRef.current.timer); loopRef.current.timer = null; }
  }
  function toggleLoop() {
    if (looping) {
      setLooping(false);
      stopLoopTimer();
      loopRef.current = null;
      return;
    }
    if (!playerRef.current) return;
    setLooping(true);
    const start = Math.max(0, Math.floor(startSec));
    const end = Math.min(start + 30, Math.max(start + 2, Math.floor(loopEnd)));
    const tick = () => {
      try {
        const t = playerRef.current?.getCurrentTime?.() ?? 0;
        if (t >= end || t < start - 0.25) {
          playerRef.current?.seekTo?.(start, true);
          playerRef.current?.playVideo?.();
        }
      } catch { /* ignore */ }
    };
    stopLoopTimer();
    const timer = window.setInterval(tick, 500);
    loopRef.current = { start, end, timer };
    try { playerRef.current.seekTo?.(start, true); playerRef.current.playVideo?.(); } catch {}
  }

  useEffect(() => () => stopLoopTimer(), []);

  return (
    <div className="space-y-2">
      <div className="rounded-2xl overflow-hidden border-2 border-[var(--border)] aspect-video bg-black">
        <div ref={hostRef} className="w-full h-full" />
      </div>
      <div className="flex items-center gap-1 flex-wrap text-sm">
        <span className="text-[var(--text-muted)] mr-1">語速</span>
        {(available.length ? available : COMMON_RATES).map(r => (
          <button
            key={r}
            onClick={() => setRateAndSave(r)}
            disabled={!ready}
            className={`px-2 py-0.5 rounded-full font-bold transition-all disabled:opacity-30 ${
              rate === r
                ? "bg-[var(--brand)] text-white"
                : "bg-gray-100 text-gray-600 hover:bg-[var(--brand-light)]"
            }`}
          >
            {r}×
          </button>
        ))}
        <button
          onClick={toggleLoop}
          disabled={!ready}
          className={`ml-2 px-3 py-0.5 rounded-full font-bold transition-all disabled:opacity-30 ${
            looping
              ? "bg-[var(--accent-orange)] text-white"
              : "bg-gray-100 text-gray-600 hover:bg-[var(--brand-light)]"
          }`}
          title="只在這個片段循環播放"
        >
          {looping ? "⏹ 停止循環" : "🔁 循環此句"}
        </button>
        {!ready && <span className="text-xs text-[var(--text-muted)] ml-2">載入中…</span>}
      </div>
    </div>
  );
}