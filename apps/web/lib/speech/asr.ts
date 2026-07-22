/**
 * Web Speech API SpeechRecognition 包裝：把麥克風語音轉成文字。
 * 瀏覽器環境專用。Chrome / Edge 支援；Firefox 未支援。
 *
 * 用於發音練習：用目標語言識別，再與預期文字比對相似度。
 */

export interface AsrResult {
  transcript: string;
  confidence: number;
}

export function isAsrSupported(): boolean {
  if (typeof window === "undefined") return false;
  const w = window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown };
  return !!(w.SpeechRecognition || w.webkitSpeechRecognition);
}

export function recognizeOnce(lang: string, timeoutMs = 10000): Promise<AsrResult> {
  return new Promise((resolve, reject) => {
    if (!isAsrSupported()) {
      reject(new Error("此瀏覽器不支援 Web Speech API（建議用 Chrome/Edge）"));
      return;
    }
    const w = window as unknown as {
      SpeechRecognition?: new () => SpeechRecognitionLike;
      webkitSpeechRecognition?: new () => SpeechRecognitionLike;
    };
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) { reject(new Error("ASR 未支援")); return; }
    const rec = new Ctor();
    rec.lang = lang;
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    let settled = false;

    const timer = setTimeout(() => {
      if (!settled) { settled = true; rec.stop(); reject(new Error("辨識逾時")); }
    }, timeoutMs);

    rec.onresult = (e: SpeechRecognitionEventLike) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const r = e.results[0];
      resolve({ transcript: r[0].transcript, confidence: r[0].confidence ?? 0 });
    };
    rec.onerror = (e: SpeechRecognitionErrorLike) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new Error(`ASR 錯誤：${e.error}`));
    };
    rec.onend = () => {
      if (!settled) { settled = true; clearTimeout(timer); reject(new Error("未辨識到語音")); }
    };
    rec.start();
  });
}

interface SpeechRecognitionAlt { transcript: string; confidence: number }
interface SpeechRecognitionResultLike { 0: SpeechRecognitionAlt }
interface SpeechRecognitionEventLike { results: SpeechRecognitionResultLike[] }
interface SpeechRecognitionErrorLike { error: string }
interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: (e: SpeechRecognitionEventLike) => void;
  onerror: (e: SpeechRecognitionErrorLike) => void;
  onend: () => void;
  start(): void;
  stop(): void;
}