"use client";

import { useEffect, useState } from "react";
import type { Card, Deck } from "@/lib/schemas";
import { listCards, listDecks } from "@/lib/db";
import { playTts, defaultVoiceFor } from "@/lib/audio/tts";
import TtsSpeedControl from "@/components/TtsSpeedControl";
import { recognizeOnce, isAsrSupported } from "@/lib/speech/asr";
import { similarityScore, charErrorRate, gradeLabel } from "@/lib/speech/similarity";
import { loadSettings } from "@/lib/store/settings";

interface Result {
  expected: string;
  transcript: string;
  score: number;
  cer: number;
}

export default function PronunciationPage() {
  const [cards, setCards] = useState<Card[]>([]);
  const [decks, setDecks] = useState<Deck[]>([]);
  const [deckId, setDeckId] = useState("");
  const [selectedCardId, setSelectedCardId] = useState("");
  const [freeText, setFreeText] = useState("");
  const [lang, setLang] = useState("es");
  const [recording, setRecording] = useState(false);
  const [playingRef, setPlayingRef] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState("");
  const [hint, setHint] = useState("");

  useEffect(() => {
    (async () => {
      const [cs, ds] = await Promise.all([listCards(), listDecks()]);
      setCards(cs); setDecks(ds);
      setLang(loadSettings().targetLang);
    })();
  }, []);

  const filtered = deckId ? cards.filter(c => c.deckId === deckId) : cards;
  const selectedCard = cards.find(c => c.id === selectedCardId);
  const target = (selectedCard?.front ?? freeText).trim();
  const ipa = selectedCard?.ipa;

  async function playReference() {
    if (!target || playingRef) return;
    setPlayingRef(true);
    setHint("🔊 合成語音中…");
    setError("");
    try {
      const voice = await defaultVoiceFor(lang) ?? lang;
      await playTts({ text: target, voice, lang });
      setHint("▶ 播放中…");
    } catch (e) {
      setError(`❌ ${e instanceof Error ? e.message : "TTS 失敗"}`);
    } finally {
      setTimeout(() => { setPlayingRef(false); setHint(""); }, 500);
    }
  }

  async function startRecording() {
    if (recording) return;
    setError(""); setResult(null);
    if (!target) { setError("⚠ 請先選擇卡片或輸入要練習的文字"); return; }
    if (!isAsrSupported()) { setError("⚠ 此瀏覽器不支援 Web Speech API，請改用 Chrome/Edge"); return; }
    setRecording(true);
    setHint("🎤 請說話…");
    try {
      const asrLang = `${lang}-${lang.toUpperCase()}`;
      const r = await recognizeOnce(asrLang);
      const score = similarityScore(target, r.transcript);
      const cer = charErrorRate(target, r.transcript);
      setResult({ expected: target, transcript: r.transcript, score, cer });
      setHint("");
    } catch (e) {
      setError(`❌ ${e instanceof Error ? e.message : "錄音失敗"}`);
    } finally {
      setRecording(false);
      setHint("");
    }
  }

  return (
    <main className="min-h-screen p-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-extrabold flex items-center gap-2">🎤 發音練習</h1>
          <p className="text-[var(--text-muted)] text-sm">錄音 → ASR 轉錄 → 與目標比對 → 評分</p>
        </div>
      </div>

      {/* 選擇來源 */}
      <section className="mb-6">
        <div className="flex gap-2 mb-3">
          <select value={deckId} onChange={e => setDeckId(e.target.value)} className="border rounded px-2 py-1">
            <option value="">全部牌組</option>
            {decks.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          <select value={lang} onChange={e => setLang(e.target.value)} className="border rounded px-2 py-1">
            {["es", "en", "zh", "ja", "ko", "fr", "de"].map(l => <option key={l} value={l}>{l}</option>)}
          </select>
        </div>
        <select value={selectedCardId} onChange={e => setSelectedCardId(e.target.value)} className="w-full border-2 rounded-2xl px-3 py-2 mb-2 font-bold">
          <option value="">（或自由輸入）</option>
          {filtered.map(c => <option key={c.id} value={c.id}>{c.front} → {c.back}</option>)}
        </select>
        {!selectedCard && (
          <input value={freeText} onChange={e => setFreeText(e.target.value)} placeholder="輸入要練習發音的文字（目標語）" className="w-full border-2 rounded-2xl px-3 py-2" />
        )}
      </section>

      {/* 目標卡 */}
      <section className="card p-6 text-center mb-6">
        <div className="text-3xl font-extrabold mb-2">{target || "（請選擇卡片或輸入文字）"}</div>
        {ipa && <div className="text-[var(--text-muted)] text-lg">{ipa}</div>}
        <div className="mt-4 flex gap-2 justify-center flex-wrap">
          <button onClick={playReference} disabled={!target || playingRef} className="btn btn-ghost">
            {playingRef ? "🔊 播放中…" : "🔊 範例發音"}
          </button>
          <button onClick={startRecording} disabled={!target || recording} className="btn btn-pink">
            {recording ? "🎤 請說話…" : "🎤 開始錄音"}
          </button>
        </div>
        <div className="mt-3 flex justify-center"><TtsSpeedControl /></div>
        {hint && <div className="text-sm text-[var(--accent-blue)] font-bold mt-2">{hint}</div>}
        {error && <div className="text-sm text-[var(--accent-pink)] font-bold mt-2">{error}</div>}
      </section>

      {/* 結果 */}
      {result && (
        <section className="card p-4 animate-pop">
          <h2 className="text-xl font-extrabold mb-3">📋 評分結果</h2>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="bg-[var(--bg)] rounded-2xl p-3">
              <div className="text-xs text-[var(--text-muted)]">目標</div>
              <div className="font-bold">{result.expected}</div>
            </div>
            <div className="bg-[var(--bg)] rounded-2xl p-3">
              <div className="text-xs text-[var(--text-muted)]">你的發音</div>
              <div className="font-bold">{result.transcript || "（未辨識到）"}</div>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className={`text-5xl font-extrabold ${gradeLabel(result.score).color}`}>{result.score}</div>
            <div>
              <div className={`font-semibold ${gradeLabel(result.score).color}`}>{gradeLabel(result.score).label}</div>
              <div className="text-xs text-gray-500">字元錯誤率 {(result.cer * 100).toFixed(0)}%</div>
            </div>
          </div>
        </section>
      )}

      {!isAsrSupported() && (
        <p className="text-xs text-gray-400 mt-6">提示：此瀏覽器不支援 Web Speech API。請用 Chrome 或 Edge 啟用麥克風辨識。</p>
      )}
    </main>
  );
}