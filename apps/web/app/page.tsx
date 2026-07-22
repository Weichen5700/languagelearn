"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import TtsSpeedControl from "@/components/TtsSpeedControl";
import { loadSettings } from "@/lib/store/settings";

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
  { emoji: "🎴", title: "單字卡", desc: "FSRS 間隔複習，離線優先", href: "/cards", color: "var(--brand)", bg: "var(--brand-light)" },
  { emoji: "📅", title: "學習計畫", desc: "每日任務 + 進度追蹤", href: "/plans", color: "var(--accent-blue)", bg: "#c7eaff" },
  { emoji: "🎤", title: "發音練習", desc: "錄音 + ASR 評分", href: "/pronunciation", color: "var(--accent-purple)", bg: "#f0d9ff" },
  { emoji: "📊", title: "學習統計", desc: "熱力圖 + 熟練度", href: "/stats", color: "var(--accent-orange)", bg: "#ffe0b3" },
  { emoji: "🔍", title: "翻譯 + 字典", desc: "Google / LibreTranslate", href: "/cards", color: "var(--accent-pink)", bg: "#ffc7c7" },
  { emoji: "🔊", title: "TTS 發音", desc: "音檔預抓快取", href: "/cards", color: "var(--accent-yellow)", bg: "#fff0b3" },
];

export default function Home() {
  const [langs, setLangs] = useState<LanguageInfo[]>([]);
  const [text, setText] = useState("你好，世界");
  const [from, setFrom] = useState("zh");
  const [to, setTo] = useState("es");
  const [result, setResult] = useState("");
  const [status, setStatus] = useState<string>("");
  const [shake, setShake] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [speaking, setSpeaking] = useState(false);

  useEffect(() => {
    fetch("/api/languages").then(r => r.json()).then(d => setLangs(d.languages ?? []));
  }, []);

  async function translate() {
    if (translating) return;
    setTranslating(true);
    setStatus("翻譯中…");
    try {
      const res = await fetch("/api/translate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text, from, to }),
      });
      const data = await res.json();
      if (data.error) {
        setStatus(`❌ ${data.error}`);
        setShake(true); setTimeout(() => setShake(false), 400);
      } else {
        setResult(data.result);
        setStatus(`✓ ${data.provider}${data.cached ? " · 快取命中 ♻️" : ""}`);
      }
    } catch (e) {
      setStatus(`❌ ${e instanceof Error ? e.message : "網路錯誤"}`);
    } finally {
      setTranslating(false);
    }
  }

  async function speak(t: string) {
    if (speaking || !t) return;
    setSpeaking(true);
    setStatus("🔊 合成語音中…");
    try {
      const lang = to;
      const voice = langs.find(l => l.code === to)?.tts.defaultVoice ?? lang;
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: t, voice, lang }),
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
      // 給播放一點時間再清狀態
      setTimeout(() => setSpeaking(false), 600);
    }
  }

  return (
    <div className="space-y-8">
      <section className="text-center py-6 animate-pop">
        <div className="text-6xl mb-3 animate-bounce-soft">🦉</div>
        <h1 className="text-4xl font-extrabold mb-2">
          <span className="text-[var(--brand)]">外語</span>學，天天進步！
        </h1>
        <p className="text-[var(--text-muted)] text-lg">
          FSRS 間隔複習 · 離線優先 · 多語言通用 · API KEY 串接翻譯與發音
        </p>
        <div className="flex gap-2 justify-center mt-6">
          <Link href="/cards" className="btn btn-primary">🎴 開始複習</Link>
          <Link href="/plans" className="btn btn-ghost">📅 建立計畫</Link>
        </div>
      </section>

      <section className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {FEATURES.map(f => (
          <Link
            key={f.title}
            href={f.href}
            className="card p-4 hover:-translate-y-1 transition-transform animate-pop"
            style={{ borderColor: f.color }}
          >
            <div
              className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl mb-2"
              style={{ background: f.bg }}
            >{f.emoji}</div>
            <div className="font-bold" style={{ color: f.color }}>{f.title}</div>
            <div className="text-sm text-[var(--text-muted)]">{f.desc}</div>
          </Link>
        ))}
      </section>

      <section>
        <h2 className="text-xl font-extrabold mb-3 flex items-center gap-2">🌐 已載入語言包</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {langs.map(l => (
            <div key={l.code} className="card-soft p-4 flex items-center gap-3 animate-pop">
              <div className="text-3xl">{l.flag}</div>
              <div>
                <div className="font-bold">{l.name} <span className="text-[var(--text-muted)] text-sm">({l.nativeName})</span></div>
                <div className="text-xs text-[var(--text-muted)]">code: {l.code} · IPA: {l.ipa ? "是" : "否"}</div>
                <div className="text-xs text-[var(--text-muted)]">🎤 {l.tts.defaultVoice}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="card p-6">
        <h2 className="text-xl font-extrabold mb-4 flex items-center gap-2">🔍 試翻譯</h2>
        <div className="flex gap-2 mb-3 items-center">
          <select value={from} onChange={e => setFrom(e.target.value)} className="border-2 rounded-2xl px-3 py-2 font-bold">
            {langs.map(l => <option key={l.code} value={l.code}>{l.flag} {l.name}</option>)}
          </select>
          <span className="text-2xl">→</span>
          <select value={to} onChange={e => setTo(e.target.value)} className="border-2 rounded-2xl px-3 py-2 font-bold">
            {langs.map(l => <option key={l.code} value={l.code}>{l.flag} {l.name}</option>)}
          </select>
        </div>
        <textarea value={text} onChange={e => setText(e.target.value)} className="w-full border-2 rounded-2xl p-3 mb-3 text-lg" rows={2} />
        <div className="flex gap-2">
          <button onClick={translate} disabled={translating} className={`btn btn-primary ${shake ? "animate-shake" : ""}`}>
            {translating ? "⏳ 翻譯中…" : "🔍 翻譯"}
          </button>
          <button onClick={() => speak(result)} disabled={!result || speaking} className="btn btn-blue">
            {speaking ? "🔊 播放中…" : "🔊 播放"}
          </button>
        </div>
        <div className="mt-3"><TtsSpeedControl /></div>
        {result && (
          <div className="mt-4 p-4 bg-[var(--brand-light)] rounded-2xl animate-flip">
            <div className="text-2xl font-bold">{result}</div>
            <div className="text-xs text-[var(--text-muted)] mt-1">{status}</div>
          </div>
        )}
        {!result && status && (
          <div className="mt-4 text-sm text-[var(--text-muted)]">{status}</div>
        )}
      </section>
    </div>
  );
}
