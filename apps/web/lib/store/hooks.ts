"use client";

import { useSyncExternalStore } from "react";
import {
  getServerSettingsSnapshot,
  getSettingsSnapshot,
  subscribeSettings,
  type Settings,
} from "./settings";
import {
  getProfileSnapshot,
  getServerProfileSnapshot,
  subscribeProfile,
  type Profile,
} from "./profile";

/**
 * 訂閱本機學習設定。localStorage 為單一來源，任何元件呼叫 saveSettings 後
 * 所有訂閱者（含其他頁面）會即時同步，且首次渲染不會與 SSR 結果不一致。
 */
export function useSettings(): Settings {
  return useSyncExternalStore(subscribeSettings, getSettingsSnapshot, getServerSettingsSnapshot);
}

/** 只取單一欄位（primitive 值，避免不必要的重繪）。 */
export function useSetting<K extends keyof Settings>(key: K): Settings[K] {
  return useSettings()[key];
}

/** 訂閱本機設定檔（多使用者名稱，純 localStorage；未建立時為 null）。 */
export function useProfile(): Profile | null {
  return useSyncExternalStore(subscribeProfile, getProfileSnapshot, getServerProfileSnapshot);
}
