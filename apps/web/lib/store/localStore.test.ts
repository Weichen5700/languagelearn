import { describe, it, expect, beforeEach, vi } from "vitest";

// node 測試環境沒有 localStorage / window，先模擬
const store = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => { store.set(k, v); },
  removeItem: (k: string) => { store.delete(k); },
});
vi.stubGlobal("window", { localStorage });

import {
  DEFAULT_SETTINGS,
  getServerSettingsSnapshot,
  getSettingsSnapshot,
  saveSettings,
  subscribeSettings,
} from "./settings";
import {
  getProfileSnapshot,
  getServerProfileSnapshot,
  renameProfile,
  subscribeProfile,
} from "./profile";

beforeEach(() => { store.clear(); });

describe("settings store（useSyncExternalStore 契約）", () => {
  it("未設定時回傳預設值", () => {
    expect(getSettingsSnapshot()).toEqual(DEFAULT_SETTINGS);
  });

  it("內容未變時回傳同一參照（否則會無限重繪）", () => {
    const first = getSettingsSnapshot();
    expect(getSettingsSnapshot()).toBe(first);
    expect(getSettingsSnapshot()).toBe(first);
  });

  it("saveSettings 後內容更新且參照改變", () => {
    const before = getSettingsSnapshot();
    saveSettings({ ...before, playbackRate: 1.5 });
    const after = getSettingsSnapshot();
    expect(after).not.toBe(before);
    expect(after.playbackRate).toBe(1.5);
  });

  it("saveSettings 通知訂閱者；取消訂閱後不再通知", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeSettings(listener);
    saveSettings({ ...getSettingsSnapshot(), ytRate: 1.25 });
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    saveSettings({ ...getSettingsSnapshot(), ytRate: 1 });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("伺服器端 snapshot 為穩定常數（SSR / hydration 用）", () => {
    expect(getServerSettingsSnapshot()).toBe(getServerSettingsSnapshot());
    expect(getServerSettingsSnapshot()).toEqual(DEFAULT_SETTINGS);
  });
});

describe("profile store（useSyncExternalStore 契約）", () => {
  it("未建立時為 null，建立後內容與參照穩定", () => {
    expect(getProfileSnapshot()).toBeNull();
    renameProfile("小明");
    const profile = getProfileSnapshot();
    expect(profile?.name).toBe("小明");
    expect(getProfileSnapshot()).toBe(profile);
  });

  it("renameProfile 通知訂閱者", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeProfile(listener);
    renameProfile("阿明");
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    expect(getProfileSnapshot()?.name).toBe("阿明");
  });

  it("伺服器端 snapshot 為 null", () => {
    expect(getServerProfileSnapshot()).toBeNull();
  });
});
