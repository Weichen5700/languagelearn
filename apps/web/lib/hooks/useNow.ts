"use client";

import { useSyncExternalStore } from "react";

const TICK_MS = 60_000;

function subscribe(callback: () => void): () => void {
  const timer = setInterval(callback, TICK_MS);
  return () => clearInterval(timer);
}

// 回傳「分鐘」層級的整數：同分鐘內參照不變，避免 useSyncExternalStore 重複重繪
function getMinuteBucket(): number {
  return Math.floor(Date.now() / TICK_MS);
}

function getServerMinuteBucket(): number {
  return 0;
}

/**
 * 外部時鐘：每分鐘更新一次，供「待複習 / 今日」判斷使用。
 * 不在 render 直接呼叫 Date.now()（會破壞 React 純度規則），
 * 且 SSR 先回 0、掛載後再切換為真實時間，不會產生 hydration 不一致。
 */
export function useNow(): number {
  return useSyncExternalStore(subscribe, getMinuteBucket, getServerMinuteBucket) * TICK_MS;
}
