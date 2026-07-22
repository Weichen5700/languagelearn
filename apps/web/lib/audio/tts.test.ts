import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock 瀏覽器 API（node 環境沒有 Audio / URL.createObjectURL）
const playStub = vi.fn().mockResolvedValue(undefined);
vi.stubGlobal("Audio", vi.fn(function (this: { play: typeof playStub; onended: null }) { this.play = playStub; this.onended = null; }));
vi.stubGlobal("URL", { createObjectURL: vi.fn().mockReturnValue("blob:mock"), revokeObjectURL: vi.fn() });

// Mock Dexie db 層
const blobs = new Map<string, { id: string; blob: Blob }>();
vi.mock("@/lib/db", () => ({
  getAudioBlob: vi.fn(async (id: string) => blobs.get(id)),
  putAudioBlob: vi.fn(async (row: { id: string; blob: Blob }) => { blobs.set(row.id, row); }),
}));

// Mock fetch
const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

import { prefetchTts, playTts } from "./tts";
import { audioId } from "@/lib/cache/audioCache";

describe("audioId", () => {
  it("以 voice + text 生成穩定 id", () => {
    expect(audioId("es-ES-Standard-A", "hola")).toBe("es-ES-Standard-A:hola");
    expect(audioId("es-ES-Standard-A", "hola")).toBe(audioId("es-ES-Standard-A", "hola"));
  });

  it("不同 voice / text 產生不同 id", () => {
    expect(audioId("es-ES-Standard-A", "hola")).not.toBe(audioId("es-ES-Standard-B", "hola"));
    expect(audioId("es-ES-Standard-A", "hola")).not.toBe(audioId("es-ES-Standard-A", "adiós"));
  });
});

describe("prefetchTts", () => {
  beforeEach(() => { blobs.clear(); fetchMock.mockReset(); });

  it("快取已存在時不重打 API", async () => {
    blobs.set("es-ES-Standard-A:hola", { id: "es-ES-Standard-A:hola", blob: new Blob([]) });
    fetchMock.mockResolvedValue(new Response("should not be called"));
    const r = await prefetchTts({ text: "hola", voice: "es-ES-Standard-A", lang: "es" });
    expect(r.source).toBe("existing");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("無快取時打 API 並存回 blob", async () => {
    fetchMock.mockResolvedValue(new Response(new Uint8Array([1, 2, 3]), {
      status: 200, headers: { "content-type": "audio/mpeg" },
    }));
    const r = await prefetchTts({ text: "mundo", voice: "es-ES-Standard-A", lang: "es" });
    expect(r.source).toBe("google");
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(blobs.has("es-ES-Standard-A:mundo")).toBe(true);
  });

  it("API 回傳 browser 降級時不存 blob", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ browser: true }), {
      status: 200, headers: { "content-type": "application/json" },
    }));
    const r = await prefetchTts({ text: "x", voice: "v", lang: "es" });
    expect(r.source).toBe("browser");
    expect(blobs.size).toBe(0);
  });
});

describe("playTts", () => {
  beforeEach(() => { blobs.clear(); fetchMock.mockReset(); });

  it("快取命中時直接播放（不打 API）", async () => {
    blobs.set("es-ES-Standard-A:hola", { id: "es-ES-Standard-A:hola", blob: new Blob([new Uint8Array([1, 2, 3])]) });
    fetchMock.mockResolvedValue(new Response("nope"));
    const r = await playTts({ text: "hola", voice: "es-ES-Standard-A", lang: "es" });
    expect(r.source).toBe("cache");
    expect(r.cached).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});