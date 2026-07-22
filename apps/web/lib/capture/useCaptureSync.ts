"use client";

import { useEffect, useRef, useState } from "react";
import type { CaptureEntry } from "./staging";
import { mergeCaptureToCard } from "./merge";

const BASE = "";
const STREAM_URL = `${BASE}/api/capture/stream`;
const PENDING_URL = `${BASE}/api/capture`;
const PATCH_URL = (id: string) => `${PENDING_URL}?id=${id}`;

export interface CaptureSyncState {
  connected: boolean;
  merged: number;
  lastWord?: string;
}

/**
 * 網站開啟時連 SSE，即時把擷取合併進 IndexedDB（immersion 卡），並標 imported。
 * 離線期間累積的 pending 在連上時一次補傳。
 * 關閉網站時擷取仍進 staging，下次開站補傳。
 */
export function useCaptureSync(enabled = true): CaptureSyncState {
  const [state, setState] = useState<CaptureSyncState>({ connected: false, merged: 0 });
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;
    let cancelled = false;

    const importOne = async (entry: CaptureEntry) => {
      const r = await mergeCaptureToCard(entry);
      if (r.created) {
        setState((s) => ({ ...s, merged: s.merged + 1, lastWord: entry.word }));
      }
      // 無論新建或重複，都標 imported，避免一直停留在 pending
      try { await fetch(PATCH_URL(entry.id), { method: "PATCH" }); } catch { /* offline ok */ }
    };

    const backfillPending = async () => {
      try {
        const res = await fetch(PENDING_URL);
        const { entries }: { entries: CaptureEntry[] } = await res.json();
        for (const e of entries) {
          if (cancelled) break;
          await importOne(e);
        }
      } catch { /* offline */ }
    };

    const es = new EventSource(STREAM_URL);
    esRef.current = es;
    es.addEventListener("ready", () => {
      setState((s) => ({ ...s, connected: true }));
      void backfillPending();
    });
    es.addEventListener("capture", (ev) => {
      try {
        const entry = JSON.parse((ev as MessageEvent).data) as CaptureEntry;
        void importOne(entry);
      } catch { /* ignore */ }
    });
    es.onerror = () => setState((s) => ({ ...s, connected: false }));

    return () => {
      cancelled = true;
      es.close();
      esRef.current = null;
    };
  }, [enabled]);

  return state;
}