import { describe, it, expect, beforeEach } from "vitest";
import { recordVisit, listVisits, _resetForTest } from "./visits";

beforeEach(() => _resetForTest());

describe("visits", () => {
  it("首次記錄 visitCount=1", () => {
    const v = recordVisit({ videoId: "v1", title: "Hola" });
    expect(v.visitCount).toBe(1);
    expect(listVisits()).toHaveLength(1);
  });

  it("同 videoId 再訪：累加次數、更新標題與 lastSeen", () => {
    recordVisit({ videoId: "v1", title: "舊標題" });
    const before = Date.now();
    const v = recordVisit({ videoId: "v1", title: "新標題" });
    expect(v.visitCount).toBe(2);
    expect(v.title).toBe("新標題");
    expect(v.lastSeen).toBeGreaterThanOrEqual(before);
    expect(listVisits()).toHaveLength(1);
  });

  it("listVisits 依 lastSeen 降序（最近在前）", () => {
    recordVisit({ videoId: "a" });
    recordVisit({ videoId: "b" });
    // 稍微推進 b 的 lastSeen
    recordVisit({ videoId: "b" });
    const ids = listVisits().map(v => v.videoId);
    expect(ids[0]).toBe("b");
  });

  it("不同 videoId 各自獨立", () => {
    recordVisit({ videoId: "a" });
    recordVisit({ videoId: "b" });
    recordVisit({ videoId: "a" });
    expect(listVisits()).toHaveLength(2);
    expect(listVisits().find(v => v.videoId === "a")!.visitCount).toBe(2);
  });
});