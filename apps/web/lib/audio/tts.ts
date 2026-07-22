import { getAudioBlob, putAudioBlob, type AudioBlobRow } from "@/lib/db";
import { audioId } from "@/lib/cache/audioCache";
import { loadSettings } from "@/lib/store/settings";

/**
 * 客戶端 TTS：優先用快取（IndexedDB audioBlobs），未命中才打 /api/tts。
 * 無 Google KEY 時 API 回傳 { browser: true }，改用瀏覽器 SpeechSynthesis。
 *
 * 快取 key = audioId(voice, text)，故同張卡重複複習不會重打 API（成本控制）。
 * 語速在「播放端」套用（audio.playbackRate / utterance.rate），不改音檔、不分裂快取。
 */

export interface PlayOptions {
  text: string;
  voice: string;       // 語音代碼（如 es-ES-Standard-A）
  lang: string;        // 語系代碼（如 es）
  rate?: number;       // 語速 0.25–4，預設讀 settings.playbackRate
}

export async function playTts(opts: PlayOptions): Promise<{ cached: boolean; source: "cache" | "google" | "browser" }> {
  const rate = clampRate(opts.rate ?? loadSettings().playbackRate);
  const id = audioId(opts.voice, opts.text);

  // 1. 快取命中：直接播放
  const hit = await getAudioBlob(id);
  if (hit) {
    await playBlob(hit.blob, rate);
    return { cached: true, source: "cache" };
  }

  // 2. 打後端 API（後端代理保護 KEY）
  const res = await fetch("/api/tts", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text: opts.text, voice: opts.voice, lang: opts.lang }),
  });

  if (res.status === 200 && res.headers.get("content-type")?.includes("audio")) {
    const blob = await res.blob();
    // 存快取供離線複習
    const row: AudioBlobRow = { id, voice: opts.voice, text: opts.text, blob, createdAt: Date.now() };
    await putAudioBlob(row);
    await playBlob(blob, rate);
    return { cached: false, source: "google" };
  }

  // 3. 降級：瀏覽器 SpeechSynthesis（無法離線快取音檔）
  const data = await res.json();
  if (data.browser) {
    speakBrowser(opts.text, data.lang ?? opts.lang, rate);
    return { cached: false, source: "browser" };
  }
  throw new Error(data.error ?? "TTS failed");
}

function clampRate(r: number): number {
  return Math.max(0.25, Math.min(4, Number.isFinite(r) ? r : 1));
}

/** 預抓音檔（不播放）：用於卡片建立/匯入時批次抓取，之後離線可播。 */
export async function prefetchTts(opts: PlayOptions): Promise<{ cached: boolean; source: "google" | "browser" | "existing" }> {
  const id = audioId(opts.voice, opts.text);
  const existing = await getAudioBlob(id);
  if (existing) return { cached: false, source: "existing" };

  const res = await fetch("/api/tts", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(opts),
  });
  if (res.status === 200 && res.headers.get("content-type")?.includes("audio")) {
    const blob = await res.blob();
    await putAudioBlob({ id, voice: opts.voice, text: opts.text, blob, createdAt: Date.now() });
    return { cached: false, source: "google" };
  }
  return { cached: false, source: "browser" };   // 無法快取瀏覽器語音
}

async function playBlob(blob: Blob, rate = 1): Promise<void> {
  const url = URL.createObjectURL(blob);
  const audio = new Audio(url);
  audio.playbackRate = clampRate(rate);
  audio.onended = () => URL.revokeObjectURL(url);
  await audio.play();
}

function speakBrowser(text: string, lang: string, rate = 1): void {
  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang;
  u.rate = clampRate(rate);
  speechSynthesis.cancel();
  speechSynthesis.speak(u);
}

/** 取得指定語言的預設語音代碼（從語言包 API 查）。 */
export async function defaultVoiceFor(lang: string): Promise<string | null> {
  const res = await fetch("/api/languages");
  const data = await res.json() as { languages: Array<{ code: string; tts?: { defaultVoice: string } }> };
  const pack = (data.languages ?? []).find(l => l.code === lang);
  return pack?.tts?.defaultVoice ?? null;
}