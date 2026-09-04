"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import TtsSpeedControl from "@/components/TtsSpeedControl";
import { loadSettings } from "@/lib/store/settings";
import { listCards, listLogs, listDecks, saveCard, type ImageBlobRow } from "@/lib/db";
import { computeStats } from "@/lib/stats/aggregate";
import { lookupWord, type DictResult } from "@/lib/audio/dictionary";
import { makeNewCardSrs } from "@/lib/review/queue";
import type { Deck } from "@/lib/schemas";

interface LanguageInfo {
  code: string;
  name: string;
  nativeName: string;
  flag?: string;
  tts: { voices: { id: string }[]; defaultVoice: string };
  ipa: boolean;
  direction: "ltr" | "rtl";
}

const FEATURES = [
  { emoji: "🎴", title: "單字卡中心", desc: "FSRS 間隔複習 · 離線記憶卡", href: "/cards", color: "var(--brand)", bg: "var(--brand-light)" },
  { emoji: "📚", title: "影片知識庫", desc: "YouTube 擷取 · 原聲與情境", href: "/library", color: "#8b5cf6", bg: "#ede9fe" },
  { emoji: "📅", title: "學習計畫", desc: "自訂進度 · 每日任務分配", href: "/plans", color: "var(--accent-blue)", bg: "#c7eaff" },
  { emoji: "🎤", title: "發音評測", desc: "Web Speech ASR · 發音比對", href: "/pronunciation", color: "var(--accent-purple)", bg: "#f0d9ff" },
  { emoji: "📊", title: "學習統計", desc: "84 天熱力圖 · 記憶留存率", href: "/stats", color: "var(--accent-orange)", bg: "#ffe0b3" },
  { emoji: "⚙️", title: "系統設定", desc: "目標語言 · 加密 Key 管理", href: "/settings", color: "#64748b", bg: "#f1f5f9" },
];

export default function Home() {
  const [langs, setLangs] = useState<LanguageInfo[]>([]);
  const [text, setText] = useState("hola");
  const [from, setFrom] = useState("es");
  const [to, setTo] = useState("zh");
  const [result, setResult] = useState("");
  const [dictEntry, setDictEntry] = useState<DictResult | null>(null);
  const [status, setStatus] = useState<string>("");
  const [shake, setShake] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [dictSearching, setDictSearching] = useState(false);
  const [speaking, setSpeaking] = useState(false);

  // 儀表板數據
  const [decks, setDecks] = useState<Deck[]>([]);
  const [selectedDeckId, setSelectedDeckId] = useState<string>("");
  const [addedToast, setAddedToast] = useState(false);
  const [dashStats, setDashStats] = useState({
    dueToday: 0,
    totalCards: 0,
    streak: 0,
    immersionCount: 0,
  });

  useEffect(() => {
    fetch("/api/languages").then(r => r.json()).then(d => {
      const list = (d.languages ?? []) as LanguageInfo[];
      setLangs(list);
      const s = loadSettings();
      if (s.targetLang) setFrom(s.targetLang);
      if (s.sourceLang) setTo(s.sourceLang);
    });

    async function loadDash() {
      try {
        const [cards, logs, ds] = await Promise.all([listCards(), listLogs(), listDecks()]);
        const stats = computeStats(cards, logs);
        setDashStats({
          dueToday: stats.dueToday,
          totalCards: stats.totalCards,
          streak: stats.streak,
          immersionCount: stats.immersionCards,
        });
        setDecks(ds);
        if (ds.length > 0) setSelectedDeckId(ds[0].id);
      } catch {
        // ignore
      }
    }
    loadDash();
  }, []);

  function swapLangs() {
    setFrom(to);
    setTo(from);
    if (result) {
      setText(result);
      setResult("");
      setDictEntry(null);
    }
  }

  async function translate() {
    if (translating || !text.trim()) return;
    setTranslating(true);
    setStatus("翻譯中…");
    try {
      const res = await fetch("/api/translate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: text.trim(), from, to }),
      });
      const data = await res.json();
      if (data.error) {
        setStatus(`❌ ${data.error}`);
        setShake(true); setTimeout(() => setShake(false), 400);
      } else {
        setResult(data.result);
        setStatus(`✓ 翻譯來源：${data.provider}${data.cached ? "（快取）" : ""}`);
      }
    } catch (e) {
      setStatus(`❌ ${e instanceof Error ? e.message : "網路錯誤"}`);
    } finally {
      setTranslating(false);
    }
  }

  async function searchDict() {
    if (dictSearching || !text.trim()) return;
    setDictSearching(true);
    setStatus("查詢字典中…");
    try {
      const entry = await lookupWord(text.trim(), from);
      if (entry) {
        setDictEntry(entry);
        if (!result && entry.definitions.length > 0) {
          setResult(entry.definitions[0]);
        }
        setStatus(`✓ 字典查詢成功${entry.ipa ? ` · /${entry.ipa}/` : ""}`);
      } else {
        setDictEntry(null);
        setStatus("⚠ 字典未收錄該字詞，已保留文字供翻譯");
      }
    } catch (e) {
      setStatus(`❌ 字典查詢錯誤：${e instanceof Error ? e.message : "未知錯誤"}`);
    } finally {
      setDictSearching(false);
    }
  }

  async function speak(t: string, langCode: string) {
    if (speaking || !t) return;
    setSpeaking(true);
    setStatus("🔊 合成語音中…");
    try {
      const voice = langs.find(l => l.code === langCode)?.tts.defaultVoice ?? langCode;
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: t, voice, lang: langCode }),
      });
      if (res.status === 200 && res.headers.get("content-type")?.includes("audio")) {
        const blob = await res.blob();
        const a = new Audio(URL.createObjectURL(blob));
        a.playbackRate = loadSettings().playbackRate || 1;
        a.play();
        setStatus("▶ 播放中…");
      } else {
        const d = await res.json();
        if (d.browser) {
          const u = new SpeechSynthesisUtterance(t);
          u.lang = d.lang;
          u.rate = loadSettings().playbackRate || 1;
          speechSynthesis.speak(u);
          setStatus("▶ 瀏覽器發音中…");
        } else setStatus(`❌ TTS 錯誤：${d.error ?? "?"}`);
      }
    } catch (e) {
      setStatus(`❌ ${e instanceof Error ? e.message : "網路錯誤"}`);
    } finally {
      setTimeout(() => setSpeaking(false), 600);
    }
  }

  async function addAsCard() {
    if (!text.trim() || !result.trim() || !selectedDeckId) return;
    const now = Date.now();
    const card = {
      id: crypto.randomUUID(),
      deckId: selectedDeckId,
      lang: from,
      cardType: "basic" as const,
      front: text.trim(),
      back: result.trim(),
      ipa: dictEntry?.ipa,
      partOfSpeech: dictEntry?.partOfSpeech,
      definitions: dictEntry?.definitions,
      dictExamples: dictEntry?.examples?.map((e: { text: string }) => e.text),
      tags: ["quick-add"],
      srs: makeNewCardSrs(),
      media: {},
      createdAt: now,
      updatedAt: now,
    };
    await saveCard(card);
    setAddedToast(true);
    setDashStats(s => ({ ...s, totalCards: s.totalCards + 1 }));
    setTimeout(() => setAddedToast(false), 2500);
  }

  return (
    <div className="space-y-8">
      {/* Hero 區域 */}
      <section className="text-center py-6 animate-pop">
        <div className="text-6xl mb-3 animate-bounce-soft">🦉</div>
        <h1 className="text-4xl font-extrabold mb-2 tracking-tight">
          <span className="text-[var(--brand)]">外語</span>學，天天進步！
        </h1>
        <p className="text-[var(--text-muted)] text-base md:text-lg max-w-xl mx-auto">
          結合 FSRS 間隔複習、YouTube 沉浸式截圖語境、即時字典與 ASR 發音打分
        </p>
        <div className="flex gap-3 justify-center mt-5">
          <Link href="/cards/review" className="btn btn-primary px-6">
            🎴 立即複習 ({dashStats.dueToday})
          </Link>
          <Link href="/cards" className="btn btn-ghost px-5">
            🗂 瀏覽單字卡
          </Link>
        </div>
      </section>

      {/* 今日學習儀表板小卡 */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="card-soft p-4 border-2 border-emerald-200 bg-emerald-50/50 flex flex-col justify-between">
          <div className="text-xs font-bold text-emerald-800 flex items-center gap-1">
            <span>📌</span> 今日到期卡
          </div>
          <div className="text-3xl font-black text-emerald-600 my-1">{dashStats.dueToday}</div>
          <Link href="/cards/review" className="text-xs font-bold text-emerald-700 hover:underline">
            {dashStats.dueToday > 0 ? "前往複習 →" : "目前已全數完成 ✓"}
          </Link>
        </div>

        <div className="card-soft p-4 border-2 border-amber-200 bg-amber-50/50 flex flex-col justify-between">
          <div className="text-xs font-bold text-amber-800 flex items-center gap-1">
            <span>🔥</span> 連續學習天數
          </div>
          <div className="text-3xl font-black text-amber-600 my-1">{dashStats.streak} <span className="text-base font-normal">天</span></div>
          <Link href="/stats" className="text-xs font-bold text-amber-700 hover:underline">
            查看學習熱力圖 →
          </Link>
        </div>

        <div className="card-soft p-4 border-2 border-blue-200 bg-blue-50/50 flex flex-col justify-between">
          <div className="text-xs font-bold text-blue-800 flex items-center gap-1">
            <span>🃏</span> 累積單字卡
          </div>
          <div className="text-3xl font-black text-blue-600 my-1">{dashStats.totalCards} <span className="text-base font-normal">張</span></div>
          <Link href="/cards" className="text-xs font-bold text-blue-700 hover:underline">
            管理牌組與卡片 →
          </Link>
        </div>

        <div className="card-soft p-4 border-2 border-purple-200 bg-purple-50/50 flex flex-col justify-between">
          <div className="text-xs font-bold text-purple-800 flex items-center gap-1">
            <span>🎬</span> 影片語境沉浸
          </div>
          <div className="text-3xl font-black text-purple-600 my-1">{dashStats.immersionCount} <span className="text-base font-normal">個</span></div>
          <Link href="/library" className="text-xs font-bold text-purple-700 hover:underline">
            重看高光語境 →
          </Link>
        </div>
      </section>

      {/* 核心功能導航卡 */}
      <section>
        <h2 className="text-xl font-extrabold mb-3 flex items-center gap-2">
          ✨ 核心學習功能
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {FEATURES.map(f => (
            <Link
              key={f.title}
              href={f.href}
              className="card p-4 hover:-translate-y-1 transition-all hover:shadow-md animate-pop block group"
              style={{ borderColor: f.color }}
            >
              <div
                className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl mb-2 transition-transform group-hover:scale-110"
                style={{ background: f.bg }}
              >{f.emoji}</div>
              <div className="font-bold text-base" style={{ color: f.color }}>{f.title}</div>
              <div className="text-xs md:text-sm text-[var(--text-muted)] mt-0.5">{f.desc}</div>
            </Link>
          ))}
        </div>
      </section>

      {/* 快速查譯與一鍵加卡工具 */}
      <section className="card p-6 shadow-sm border-2 border-[var(--border)]">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <h2 className="text-xl font-extrabold flex items-center gap-2">
            <span>🔍</span> 快速翻譯、查字典與即時加卡
          </h2>
          <span className="text-xs text-[var(--text-muted)]">支援離線快取、IPA 音標與例句解析</span>
        </div>

        {/* 語言選擇與交換 */}
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <div className="flex items-center gap-1.5 bg-gray-50 border rounded-2xl px-3 py-1.5">
            <span className="text-xs text-[var(--text-muted)]">從：</span>
            <select
              value={from}
              onChange={e => setFrom(e.target.value)}
              className="font-bold bg-transparent text-sm cursor-pointer"
            >
              {langs.map(l => <option key={l.code} value={l.code}>{l.flag} {l.name}</option>)}
            </select>
          </div>

          <button
            type="button"
            onClick={swapLangs}
            title="交換語言"
            className="btn-ghost btn p-2 rounded-full w-9 h-9 flex items-center justify-center text-sm hover:scale-110"
          >
            ⇄
          </button>

          <div className="flex items-center gap-1.5 bg-gray-50 border rounded-2xl px-3 py-1.5">
            <span className="text-xs text-[var(--text-muted)]">到：</span>
            <select
              value={to}
              onChange={e => setTo(e.target.value)}
              className="font-bold bg-transparent text-sm cursor-pointer"
            >
              {langs.map(l => <option key={l.code} value={l.code}>{l.flag} {l.name}</option>)}
            </select>
          </div>
        </div>

        {/* 輸入框 */}
        <div className="relative">
          <textarea
            value={text}
            onChange={e => { setText(e.target.value); setResult(""); setDictEntry(null); }}
            placeholder="請輸入單字、片語或句子…"
            className="w-full border-2 rounded-2xl p-3 text-base min-h-[90px] focus:ring-2 focus:ring-[var(--brand)]"
            rows={2}
          />
        </div>

        {/* 操作按鈕群 */}
        <div className="flex flex-wrap gap-2 mt-2 items-center">
          <button
            onClick={translate}
            disabled={translating || !text.trim()}
            className={`btn btn-primary px-4 py-2 text-sm ${shake ? "animate-shake" : ""}`}
          >
            {translating ? "⏳ 翻譯中…" : "🔍 翻譯"}
          </button>

          <button
            onClick={searchDict}
            disabled={dictSearching || !text.trim()}
            className="btn btn-purple px-4 py-2 text-sm"
          >
            {dictSearching ? "📖 查字典…" : "📖 查字典 (IPA/釋義)"}
          </button>

          <button
            onClick={() => speak(text, from)}
            disabled={!text.trim() || speaking}
            className="btn btn-ghost px-3 py-2 text-sm"
          >
            {speaking ? "🔊…" : "🔊 讀原文"}
          </button>

          <div className="ml-auto">
            <TtsSpeedControl compact />
          </div>
        </div>

        {/* 結果展示區域 */}
        {(result || dictEntry) && (
          <div className="mt-4 p-4 bg-emerald-50/70 border-2 border-emerald-200 rounded-2xl animate-pop">
            <div className="flex items-baseline justify-between flex-wrap gap-2">
              <div className="text-2xl font-black text-emerald-950 flex items-center gap-2">
                <span>{result || dictEntry?.word}</span>
                {dictEntry?.ipa && (
                  <span className="text-sm font-semibold text-amber-600">/{dictEntry.ipa}/</span>
                )}
                {dictEntry?.partOfSpeech && (
                  <span className="chip bg-emerald-200 text-emerald-900 text-xs">
                    {dictEntry.partOfSpeech}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => speak(result || dictEntry?.word || "", to)}
                  disabled={speaking}
                  className="btn btn-blue px-3 py-1 text-xs"
                >
                  🔊 朗讀譯文
                </button>
              </div>
            </div>

            {/* 字典釋義條列 */}
            {dictEntry?.definitions && dictEntry.definitions.length > 0 && (
              <div className="mt-3 text-sm text-gray-700 space-y-1">
                <div className="font-bold text-xs text-gray-500">📖 釋義：</div>
                <ul className="list-disc pl-5 space-y-0.5">
                  {dictEntry.definitions.slice(0, 3).map((def: string, i: number) => (
                    <li key={i}>{def}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* 字典例句 */}
            {dictEntry?.examples && dictEntry.examples.length > 0 && (
              <div className="mt-2 text-xs italic text-gray-600 bg-white/60 p-2 rounded-xl">
                <div>例："{dictEntry.examples[0].text}"</div>
                {dictEntry.examples[0].translation && (
                  <div className="text-gray-500">"{dictEntry.examples[0].translation}"</div>
                )}
              </div>
            )}

            {/* 一鍵加入單字卡列 */}
            {decks.length > 0 && (
              <div className="mt-4 pt-3 border-t border-emerald-200 flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2 text-xs">
                  <span className="font-bold text-emerald-900">加入牌組：</span>
                  <select
                    value={selectedDeckId}
                    onChange={e => setSelectedDeckId(e.target.value)}
                    className="border rounded-xl px-2 py-1 text-xs bg-white font-semibold"
                  >
                    {decks.map(d => <option key={d.id} value={d.id}>{d.name} ({d.lang})</option>)}
                  </select>
                </div>

                <button
                  onClick={addAsCard}
                  className="btn btn-primary px-3 py-1.5 text-xs flex items-center gap-1 shadow-sm"
                >
                  <span>＋</span> 存入單字卡
                </button>
              </div>
            )}

            {addedToast && (
              <div className="mt-2 text-xs font-bold text-emerald-700 animate-pop">
                ✓ 已成功加入單字卡庫！
              </div>
            )}
          </div>
        )}

        {status && !result && !dictEntry && (
          <div className="mt-3 text-sm text-[var(--text-muted)]">{status}</div>
        )}
      </section>

      {/* 語言支援展示 */}
      <section>
        <h2 className="text-xl font-extrabold mb-3 flex items-center gap-2">🌐 支援外語體系</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {langs.map(l => (
            <div key={l.code} className="card-soft p-3 flex items-center gap-3 animate-pop border border-[var(--border)]">
              <div className="text-3xl">{l.flag}</div>
              <div className="min-w-0">
                <div className="font-bold text-sm truncate">
                  {l.name} <span className="text-[var(--text-muted)] text-xs font-normal">({l.nativeName})</span>
                </div>
                <div className="text-[11px] text-[var(--text-muted)] truncate">
                  IPA: {l.ipa ? "支援" : "無"} · {l.code}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

