"use client";

import { useEffect, useState } from "react";
import { loadSettings, saveSettings, type Settings } from "@/lib/store/settings";

/**
 * TTS 語速控制：讀寫 settings.playbackRate（持久化）。
 * 播放端套用（audio.playbackRate / utterance.rate），不改音檔、不分裂快取。
 * 改動立即生效（下次 playTts 讀 settings），不用重整。
 */
const RATES = [0.5, 0.75, 1, 1.25, 1.5, 1.75];

export default function TtsSpeedControl({ compact = false }: { compact?: boolean }) {
  const [rate, setRate] = useState<number>(1);

  useEffect(() => {
    setRate(loadSettings().playbackRate);
  }, []);

  function set(r: number) {
    setRate(r);
    const s: Settings = { ...loadSettings(), playbackRate: r };
    saveSettings(s);
  }

  return (
    <div className={`flex items-center gap-1 ${compact ? "text-xs" : "text-sm"}`}>
      <span className="text-[var(--text-muted)] mr-1">語速</span>
      {RATES.map(r => (
        <button
          key={r}
          onClick={() => set(r)}
          className={`px-2 py-0.5 rounded-full font-bold transition-all ${
            rate === r
              ? "bg-[var(--brand)] text-white"
              : "bg-gray-100 text-gray-600 hover:bg-[var(--brand-light)]"
          }`}
        >
          {r}×
        </button>
      ))}
    </div>
  );
}