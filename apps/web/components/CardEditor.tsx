"use client";

import { useState, useEffect } from "react";
import type { Card, Deck } from "@/lib/schemas";
import { saveCard } from "@/lib/db";
import { makeNewCardSrs } from "@/lib/review/queue";
import { translateText } from "@/lib/audio/translate";
import { playTts, prefetchTts, defaultVoiceFor } from "@/lib/audio/tts";
import { lookupWord } from "@/lib/audio/dictionary";
import { loadSettings } from "@/lib/store/settings";

interface Props {
  decks: Deck[];
  initial?: Card | null;
  defaultDeckId?: string;
  onSaved: () => void;
  onCancel: () => void;
}

const CARD_TYPES = [
  { value: "basic", label: "基本（正反）" },
  { value: "cloze", label: "克漏字" },
  { value: "ipa", label: "音標卡" },
  { value: "image", label: "圖片卡" },
  { value: "immersion", label: "沉浸（影片擷取）" },
] as const;

export default function CardEditor({ decks, initial, defaultDeckId, onSaved, onCancel }: Props) {
  const [deckId, setDeckId] = useState(initial?.deckId ?? defaultDeckId ?? decks[0]?.id ?? "");
  const [cardType, setCardType] = useState<Card["cardType"]>(initial?.cardType ?? "basic");
  const [front, setFront] = useState(initial?.front ?? "");
  const [back, setBack] = useState(initial?.back ?? "");
  const [ipa, setIpa] = useState(initial?.ipa ?? "");
  const [example, setExample] = useState(initial?.example ?? "");
  const [exampleTranslation, setExampleTranslation] = useState(initial?.exampleTranslation ?? "");
  const [clozeText, setClozeText] = useState(initial?.clozeText ?? "");
  const [tags, setTags] = useState((initial?.tags ?? []).join(", "));
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState<string>("");
  const [hint, setHint] = useState("");

  useEffect(() => {
    if (decks.length && !deckId) setDeckId(decks[0].id);
  }, [decks, deckId]);

  const targetLang = decks.find(d => d.id === deckId)?.lang ?? loadSettings().targetLang;
  const sourceLang = loadSettings().sourceLang;

  async function autoTranslate() {
    if (!front.trim() || busy) return;
    setBusy("translate");
    setHint("🔍 翻譯中…");
    try {
      const r = await translateText(front.trim(), targetLang, sourceLang);
      setBack(r.result);
      setHint(`✓ 已翻譯（${r.provider}${r.cached ? " · 快取" : ""}）`);
    } catch (err) {
      setHint(`❌ 翻譯失敗：${err instanceof Error ? err.message : err}`);
    } finally {
      setBusy("");
    }
  }

  async function previewSpeak() {
    if (!front.trim() || busy) return;
    setBusy("speak");
    setHint("🔊 合成語音中…");
    try {
      const voice = await defaultVoiceFor(targetLang) ?? targetLang;
      await playTts({ text: front.trim(), voice, lang: targetLang });
      setHint("▶ 播放中…");
    } catch (err) {
      setHint(`❌ 發音失敗：${err instanceof Error ? err.message : err}`);
    } finally {
      setTimeout(() => { setBusy(""); }, 500);
    }
  }

  async function autoTranslateExample() {
    if (!example.trim() || busy) return;
    setBusy("exTranslate");
    setHint("🔍 翻譯例句…");
    try {
      const r = await translateText(example.trim(), targetLang, sourceLang);
      setExampleTranslation(r.result);
      setHint(`✓ 例句已譯（${r.provider}${r.cached ? " · 快取" : ""}）`);
    } catch (err) {
      setHint(`❌ 翻譯失敗：${err instanceof Error ? err.message : err}`);
    } finally {
      setBusy("");
    }
  }

  async function lookupDict() {
    if (!front.trim() || busy) return;
    setBusy("dict");
    setHint("📖 查詢中…");
    try {
      const entry = await lookupWord(front.trim(), targetLang);
      if (!entry) { setHint("⚠ 字典查無此字"); return; }
      if (entry.ipa && !ipa) setIpa(entry.ipa);
      if (entry.examples?.[0]?.text && !example) setExample(entry.examples[0].text);
      setHint(`✓ ${entry.word}${entry.partOfSpeech ? ` (${entry.partOfSpeech})` : ""} · ${entry.definitions.length} 條釋義${entry.ipa ? ` · /${entry.ipa}/` : ""}`);
    } catch (err) {
      setHint(`❌ 查字典失敗：${err instanceof Error ? err.message : err}`);
    } finally {
      setBusy("");
    }
  }

  async function save() {
    if (!deckId || !front.trim() || !back.trim()) return;
    setSaving(true);
    const now = Date.now();
    const card: Card = {
      id: initial?.id ?? crypto.randomUUID(),
      userId: initial?.userId,
      deckId,
      lang: initial?.lang ?? decks.find(d => d.id === deckId)?.lang ?? "es",
      cardType,
      front: front.trim(),
      back: back.trim(),
      ipa: ipa.trim() || undefined,
      partOfSpeech: initial?.partOfSpeech,
      definitions: initial?.definitions,
      dictExamples: initial?.dictExamples,
      example: example.trim() || undefined,
      exampleTranslation: exampleTranslation.trim() || undefined,
      clozeText: cardType === "cloze" ? clozeText.trim() || undefined : undefined,
      context: initial?.context,     // 沉浸卡保留語境；手動新增時為 undefined
      media: initial?.media ?? {},
      tags: tags.split(",").map(t => t.trim()).filter(Boolean),
      srs: initial?.srs ?? makeNewCardSrs(),
      createdAt: initial?.createdAt ?? now,
      updatedAt: now,
    };
    await saveCard(card);
    // 預抓 TTS 音檔到 IndexedDB，首次複習即可離線播放
    try {
      const voice = await defaultVoiceFor(targetLang) ?? targetLang;
      await prefetchTts({ text: card.front, voice, lang: targetLang });
    } catch { /* 預抓失敗不阻塞儲存 */ }
    setSaving(false);
    onSaved();
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" onClick={onCancel}>
      <div className="bg-white rounded-lg p-6 w-full max-w-lg" onClick={e => e.stopPropagation()}>
        <h2 className="text-xl font-bold mb-4">{initial ? "編輯卡片" : "新增卡片"}</h2>
        <div className="space-y-3">
          <div className="flex gap-2">
            <select value={deckId} onChange={e => setDeckId(e.target.value)} className="border rounded px-2 py-1 flex-1">
              {decks.map(d => <option key={d.id} value={d.id}>{d.name} ({d.lang})</option>)}
            </select>
            <select value={cardType} onChange={e => setCardType(e.target.value as Card["cardType"])} className="border rounded px-2 py-1">
              {CARD_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <input value={front} onChange={e => setFront(e.target.value)} placeholder="正面（目標語，如 hola）" className="w-full border-2 rounded-2xl px-3 py-2" />
          <div className="flex gap-2 -mt-1 items-center flex-wrap">
            <button type="button" onClick={previewSpeak} disabled={busy === "speak" || !front.trim()} className="btn btn-ghost px-3 py-1.5 text-sm">
              {busy === "speak" ? "🔊…" : "🔊 試聽"}
            </button>
            <button type="button" onClick={autoTranslate} disabled={busy === "translate" || !front.trim()} className="btn btn-ghost px-3 py-1.5 text-sm" style={{ color: "var(--accent-blue)" }}>
              {busy === "translate" ? "翻譯中…" : "🔍 翻譯成反面"}
            </button>
            <button type="button" onClick={lookupDict} disabled={busy === "dict" || !front.trim()} className="btn btn-ghost px-3 py-1.5 text-sm" style={{ color: "var(--accent-purple)" }}>
              {busy === "dict" ? "查詢中…" : "📖 查字典"}
            </button>
            {hint && <span className="text-xs text-[var(--text-muted)] font-bold">{hint}</span>}
          </div>
          <input value={back} onChange={e => setBack(e.target.value)} placeholder="反面（母語，如 你好）" className="w-full border-2 rounded-2xl px-3 py-2" />
          <input value={ipa} onChange={e => setIpa(e.target.value)} placeholder="IPA 音標（可選，如 /ˈo.la/）" className="w-full border rounded px-3 py-2" />
          <input value={example} onChange={e => setExample(e.target.value)} placeholder="例句（可選）" className="w-full border rounded px-3 py-2" />
          <div className="flex gap-2 -mt-1">
            <input value={exampleTranslation} onChange={e => setExampleTranslation(e.target.value)} placeholder="例句中譯（雙語對照，可選）" className="flex-1 border rounded px-3 py-2" />
            <button type="button" onClick={autoTranslateExample} disabled={busy !== "" || !example.trim()} className="btn btn-ghost px-3 py-1.5 text-sm whitespace-nowrap">
              {busy === "exTranslate" ? "翻譯中…" : "🔍 譯例句"}
            </button>
          </div>
          {cardType === "cloze" && (
            <input value={clozeText} onChange={e => setClozeText(e.target.value)} placeholder="克漏字句（用 [...] 標示空缺）" className="w-full border rounded px-3 py-2" />
          )}
          <input value={tags} onChange={e => setTags(e.target.value)} placeholder="標籤（逗號分隔，如 问候,基礎）" className="w-full border rounded px-3 py-2" />
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onCancel} className="px-4 py-2 border rounded">取消</button>
          <button onClick={save} disabled={saving || !front.trim() || !back.trim()} className="px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-50">
            {saving ? "儲存中…" : "儲存"}
          </button>
        </div>
      </div>
    </div>
  );
}