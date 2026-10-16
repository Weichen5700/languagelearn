"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
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

// 瀏覽器能力在 SSR 期間不可知：伺服器端先假定支援，掛載後再校正，
// 否則「伺服器渲染提示、客戶端不渲染」會造成 hydration 不一致。
const subscribeNoop = () => () => {};
const isSupportedOnServer = () => true;

export default function PronunciationPage() {
  const asrSupported = useSyncExternalStore(subscribeNoop, isAsrSupported, isSupportedOnServer);
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

  function pickRandomCard() {
    if (filtered.length === 0) return;
    const random = filtered[Math.floor(Math.random() * filtered.length)];
    setSelectedCardId(random.id);
    setResult(null);
    setError("");
  }

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
    setHint("🎤 請對著麥克風朗讀…");
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

  const LANGS = [
    { code: "es", name: "西班牙文 🇪🇸" },
    { code: "en", name: "英文 🇬🇧" },
    { code: "zh", name: "中文 🇹🇼" },
    { code: "ja", name: "日文 🇯🇵" },
    { code: "ko", name: "韓文 🇰🇷" },
    { code: "fr", name: "法文 🇫🇷" },
    { code: "de", name: "德文 🇩🇪" },
  ];

  return (
    <main className="min-h-screen max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-3xl font-extrabold flex items-center gap-2">
            <span>🎤</span> 發音評測練習
          </h1>
          <p className="text-[var(--text-muted)] text-sm mt-0.5">
            真人比對 · Web Speech 語音辨識 · 字元錯誤率 (CER) 打分
          </p>
        </div>

        {filtered.length > 0 && (
          <button
            onClick={pickRandomCard}
            className="btn btn-ghost px-3.5 py-1.5 text-xs font-bold flex items-center gap-1 hover:scale-105"
          >
            <span>🎲</span>
            <span>隨機抽一張卡</span>
          </button>
        )}
      </div>

      {/* 來源與語言選擇面板 */}
      <section className="card p-4 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-bold text-[var(--text-muted)] mb-1 block">選擇牌組</label>
            <select
              value={deckId}
              onChange={e => { setDeckId(e.target.value); setSelectedCardId(""); }}
              className="w-full border-2 rounded-2xl px-3 py-2 text-sm font-semibold bg-white"
            >
              <option value="">📚 全部牌組 ({cards.length} 張卡)</option>
              {decks.map(d => <option key={d.id} value={d.id}>{d.name} ({d.lang})</option>)}
            </select>
          </div>

          <div>
            <label className="text-xs font-bold text-[var(--text-muted)] mb-1 block">發音目標語</label>
            <select
              value={lang}
              onChange={e => setLang(e.target.value)}
              className="w-full border-2 rounded-2xl px-3 py-2 text-sm font-semibold bg-white"
            >
              {LANGS.map(l => <option key={l.code} value={l.code}>{l.name}</option>)}
            </select>
          </div>
        </div>

        <div>
          <label className="text-xs font-bold text-[var(--text-muted)] mb-1 block">練習目標</label>
          <select
            value={selectedCardId}
            onChange={e => { setSelectedCardId(e.target.value); setResult(null); setError(""); }}
            className="w-full border-2 rounded-2xl px-3 py-2 text-sm font-bold bg-white"
          >
            <option value="">（或於下方直接輸入文字自由練習）</option>
            {filtered.map(c => <option key={c.id} value={c.id}>{c.front} → {c.back}</option>)}
          </select>
        </div>

        {!selectedCard && (
          <div>
            <input
              value={freeText}
              onChange={e => { setFreeText(e.target.value); setResult(null); setError(""); }}
              placeholder="輸入想要練習發音的外語文字（例如：¡Buenos días!）…"
              className="w-full border-2 rounded-2xl px-4 py-2 text-sm bg-white focus:ring-2 focus:ring-[var(--brand)]"
            />
          </div>
        )}
      </section>

      {/* 目標卡與錄音區 */}
      <section className="card p-8 text-center space-y-4 shadow-sm border-2 border-[var(--border)]">
        <div className="space-y-1">
          <div className="text-xs font-bold text-[var(--text-muted)]">練習發音目標</div>
          <div className="text-3xl md:text-4xl font-black text-gray-900 tracking-tight">
            {target || "（請於上方選擇卡片或輸入練習句）"}
          </div>
          {ipa && (
            <div className="text-base font-semibold text-amber-600">/{ipa}/</div>
          )}
          {selectedCard?.back && (
            <div className="text-sm text-[var(--text-muted)] mt-1 font-medium">
              中文釋義：{selectedCard.back}
            </div>
          )}
        </div>

        {/* 錄音動態視覺反饋 */}
        {recording && (
          <div className="py-2 animate-pop">
            <div className="w-16 h-16 rounded-full bg-red-500 text-white flex items-center justify-center text-3xl animate-pulse-ring mx-auto shadow-lg">
              🎙️
            </div>
            <div className="text-xs font-black text-red-600 mt-2">正在聆聽您的發音，請朗讀…</div>
          </div>
        )}

        <div className="flex gap-3 justify-center flex-wrap pt-2">
          <button
            onClick={playReference}
            disabled={!target || playingRef || recording}
            className="btn btn-ghost px-5 py-2.5 text-sm"
          >
            {playingRef ? "🔊 播放中…" : "🔊 範例標準音"}
          </button>

          <button
            onClick={startRecording}
            disabled={!target || recording}
            className={`btn px-6 py-2.5 text-sm font-extrabold text-white ${recording ? "bg-red-600" : "btn-pink"}`}
          >
            {recording ? "⏹ 正在聆聽…" : "🎤 開始錄音評測"}
          </button>
        </div>

        <div className="pt-2 flex justify-center">
          <TtsSpeedControl compact />
        </div>

        {hint && <div className="text-sm text-[var(--accent-blue)] font-bold animate-pop">{hint}</div>}
        {error && <div className="text-sm text-[var(--accent-pink)] font-bold animate-shake">{error}</div>}
      </section>

      {/* 評測打分結果 */}
      {result && (
        <section className="card p-6 animate-pop border-2 border-emerald-200 bg-emerald-50/40 space-y-4">
          <h2 className="text-xl font-extrabold flex items-center gap-2 text-emerald-950">
            <span>📋</span> 評測結果分析
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="bg-white rounded-2xl p-4 border border-emerald-100 shadow-xs">
              <div className="text-xs font-bold text-[var(--text-muted)] mb-1">目標原文</div>
              <div className="text-lg font-black text-gray-900">{result.expected}</div>
            </div>

            <div className="bg-white rounded-2xl p-4 border border-emerald-100 shadow-xs">
              <div className="text-xs font-bold text-[var(--text-muted)] mb-1">您的語音辨識結果</div>
              <div className="text-lg font-black text-gray-900">
                {result.transcript || "（未辨識到清晰語音）"}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4 bg-white p-4 rounded-2xl border border-emerald-100">
            <div className={`text-5xl font-black ${gradeLabel(result.score).color}`}>
              {result.score}
            </div>
            <div>
              <div className={`text-lg font-black ${gradeLabel(result.score).color}`}>
                {gradeLabel(result.score).label}
                {result.score >= 90 ? " 🌟" : result.score >= 75 ? " 👍" : " 💪"}
              </div>
              <div className="text-xs text-[var(--text-muted)] mt-0.5">
                字元錯誤率 (CER)：{(result.cer * 100).toFixed(1)}% · 相似度演算法比對
              </div>
            </div>

            <button
              onClick={startRecording}
              className="ml-auto btn btn-primary px-4 py-2 text-xs font-bold"
            >
              再練一次
            </button>
          </div>
        </section>
      )}

      {!asrSupported && (
        <div className="card p-4 text-xs text-amber-800 bg-amber-50 border-amber-200">
          💡 提示：目前瀏覽器尚未支援 Web Speech API。建議使用 Chrome 或 Edge 瀏覽器以獲得完整的語音辨識與錄音比對功能。
        </div>
      )}
    </main>
  );
}