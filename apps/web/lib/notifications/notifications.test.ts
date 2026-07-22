import { describe, it, expect, beforeEach, vi } from "vitest";

// notifications.ts 只動 localStorage + Notification；node 環境模擬之
const store = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => { store.set(k, v); },
  removeItem: (k: string) => { store.delete(k); },
});
let perm: NotificationPermission = "default";
const NotificationStub: any = vi.fn(function (this: any) { this.onclick = null; });
Object.defineProperty(NotificationStub, "permission", { get: () => perm });
NotificationStub.requestPermission = vi.fn(async () => (perm = "granted"));
vi.stubGlobal("Notification", NotificationStub);

vi.stubGlobal("window", {
  Notification: NotificationStub,
  focus: vi.fn(),
  location: { href: "" },
});

import {
  todayKey,
  alreadyNotifiedToday,
  markNotifiedToday,
  notificationsSupported,
  ensurePermission,
  fireNotification,
} from "./notifications";

beforeEach(() => { store.clear(); perm = "default"; NotificationStub.mockClear(); });

describe("notifications", () => {
  it("todayKey 為今日日期鍵", () => {
    const d = new Date();
    expect(todayKey()).toBe(`${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`);
  });

  it("未通知時 alreadyNotifiedToday=false；mark 後為 true", () => {
    expect(alreadyNotifiedToday()).toBe(false);
    markNotifiedToday();
    expect(alreadyNotifiedToday()).toBe(true);
  });

  it("ensurePermission 要求後回 granted", async () => {
    expect(await ensurePermission()).toBe("granted");
  });

  it("fireNotification 在 granted 時建構 Notification", () => {
    perm = "granted";
    fireNotification("title", "body");
    expect(NotificationStub).toHaveBeenCalledOnce();
  });

  it("fireNotification 在非 granted 時不建構", () => {
    perm = "default";
    fireNotification("t", "b");
    expect(NotificationStub).not.toHaveBeenCalled();
  });

  it("notificationsSupported 在有 Notification 時為 true", () => {
    expect(notificationsSupported()).toBe(true);
  });
});