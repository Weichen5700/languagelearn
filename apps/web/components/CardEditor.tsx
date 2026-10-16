"use client";

import { useState } from "react";
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
  const [deckId, setDeckId] = useState(initial?.deckId ?? defaultDeckId ?? "");
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

  const [dictDefs, setDictDefs] = useState<string[]>([]);

  // 牌組非同步載入完成前為空值 → 以「衍生值」代替 effect 內 setState
  const activeDeckId = deckId || decks[0]?.id || "";

  const targetLang = decks.find(d => d.id === activeDeckId)?.lang ?? loadSettings().targetLang;
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
      if (entry.definitions && entry.definitions.length > 0) {
        setDictDefs(entry.definitions);
        if (!back.trim()) setBack(entry.definitions[0]);
      }
      setHint(`✓ ${entry.word}${entry.partOfSpeech ? ` (${entry.partOfSpeech})` : ""} · ${entry.definitions.length} 條釋義${entry.ipa ? ` · /${entry.ipa}/` : ""}`);
    } catch (err) {
      setHint(`❌ 查字典失敗：${err instanceof Error ? err.message : err}`);
    } finally {
      setBusy("");
    }
  }

  async function save() {
    if (!activeDeckId || !front.trim() || !back.trim()) return;
    setSaving(true);
    const now = Date.now();
    const card: Card = {
      id: initial?.id ?? crypto.randomUUID(),
      userId: initial?.userId,
      deckId: activeDeckId,
      lang: initial?.lang ?? decks.find(d => d.id === activeDeckId)?.lang ?? "es",
      cardType,
      front: front.trim(),
      back: back.trim(),
      ipa: ipa.trim() || undefined,
      partOfSpeech: initial?.partOfSpeech,
      definitions: initial?.definitions ?? (dictDefs.length > 0 ? dictDefs : undefined),
      dictExamples: initial?.dictExamples,
      example: example.trim() || undefined,
      exampleTranslation: exampleTranslation.trim() || undefined,
      clozeText: cardType === "cloze" ? clozeText.trim() || undefined : undefined,
      context: initial?.context,
      media: initial?.media ?? {},
      tags: tags.split(",").map(t => t.trim()).filter(Boolean),
      srs: initial?.srs ?? makeNewCardSrs(),
      createdAt: initial?.createdAt ?? now,
      updatedAt: now,
    };
    await saveCard(card);
    try {
      const voice = await defaultVoiceFor(targetLang) ?? targetLang;
      await prefetchTts({ text: card.front, voice, lang: targetLang });
    } catch { /* ignore */ }
    setSaving(false);
    onSaved();
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto" onClick={onCancel}>
      <div className="bg-white rounded-3xl p-6 w-full max-w-lg shadow-2xl border-2 border-[var(--border)] animate-pop my-8" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-extrabold flex items-center gap-2">
            <span>{initial ? "✏ 編輯單字卡" : "✨ 新增單字卡"}</span>
          </h2>
          <button onClick={onCancel} className="text-[var(--text-muted)] hover:text-gray-800 text-lg w-8 h-8 rounded-full flex items-center justify-center hover:bg-gray-100">
            ✕
          </button>
        </div>

        <div className="space-y-3.5">
          {/* 牌組與卡片類型 */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs font-bold text-[var(--text-muted)] mb-1 block">所屬牌組</label>
              <select value={activeDeckId} onChange={e => setDeckId(e.target.value)} className="w-full border-2 rounded-2xl px-3 py-2 text-sm font-semibold bg-white">
                {decks.map(d => <option key={d.id} value={d.id}>{d.name} ({d.lang})</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-bold text-[var(--text-muted)] mb-1 block">卡片類型</label>
              <select value={cardType} onChange={e => setCardType(e.target.value as Card["cardType"])} className="w-full border-2 rounded-2xl px-3 py-2 text-sm font-semibold bg-white">
                {CARD_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
          </div>

          {/* 正面目標語 */}
          <div>
            <label className="text-xs font-bold text-[var(--text-muted)] mb-1 block">正面（目標外語）*</label>
            <input
              value={front}
              onChange={e => setFront(e.target.value)}
              placeholder="例如：desarrollar、gracias…"
              className="w-full border-2 rounded-2xl px-3 py-2 text-base font-bold bg-white"
            />
          </div>

          {/* 輔助操作按鈕 */}
          <div className="flex gap-1.5 items-center flex-wrap">
            <button type="button" onClick={previewSpeak} disabled={busy === "speak" || !front.trim()} className="btn btn-ghost px-2.5 py-1 text-xs">
              {busy === "speak" ? "🔊…" : "🔊 試聽"}
            </button>
            <button type="button" onClick={autoTranslate} disabled={busy === "translate" || !front.trim()} className="btn btn-ghost px-2.5 py-1 text-xs" style={{ color: "var(--accent-blue)" }}>
              {busy === "translate" ? "翻譯中…" : "🔍 自動翻譯"}
            </button>
            <button type="button" onClick={lookupDict} disabled={busy === "dict" || !front.trim()} className="btn btn-ghost px-2.5 py-1 text-xs" style={{ color: "var(--accent-purple)" }}>
              {busy === "dict" ? "查詢中…" : "📖 查字典 (IPA/釋義)"}
            </button>
            {hint && <span className="text-xs text-[var(--text-muted)] font-medium ml-1">{hint}</span>}
          </div>

          {/* 字典釋義候選 chips */}
          {dictDefs.length > 0 && (
            <div className="bg-purple-50 p-2.5 rounded-2xl border border-purple-200">
              <div className="text-xs font-bold text-purple-900 mb-1.5">點選釋義直接帶入反面：</div>
              <div className="flex flex-wrap gap-1.5">
                {dictDefs.map((def, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setBack(def)}
                    className="chip bg-white border border-purple-200 text-purple-800 hover:bg-purple-600 hover:text-white transition-colors cursor-pointer text-xs"
                  >
                    + {def}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 反面翻譯 */}
          <div>
            <label className="text-xs font-bold text-[var(--text-muted)] mb-1 block">反面（母語釋義）*</label>
            <input
              value={back}
              onChange={e => setBack(e.target.value)}
              placeholder="例如：發展、謝謝…"
              className="w-full border-2 rounded-2xl px-3 py-2 text-base font-bold bg-white"
            />
          </div>

          {/* IPA 音標 */}
          <div>
            <label className="text-xs font-bold text-[var(--text-muted)] mb-1 block">IPA 國際音標（可選）</label>
            <input
              value={ipa}
              onChange={e => setIpa(e.target.value)}
              placeholder="例如：/ˈo.la/、/ɡɾa.sjas/"
              className="w-full border-2 rounded-2xl px-3 py-2 text-sm bg-white"
            />
          </div>

          {/* 例句與中譯 */}
          <div>
            <label className="text-xs font-bold text-[var(--text-muted)] mb-1 block">例句與中文對照（可選）</label>
            <div className="space-y-1.5">
              <input
                value={example}
                onChange={e => setExample(e.target.value)}
                placeholder="外語例句…"
                className="w-full border-2 rounded-2xl px-3 py-2 text-sm bg-white"
              />
              <div className="flex gap-2">
                <input
                  value={exampleTranslation}
                  onChange={e => setExampleTranslation(e.target.value)}
                  placeholder="例句中文翻譯…"
                  className="flex-1 border-2 rounded-2xl px-3 py-2 text-sm bg-white"
                />
                <button
                  type="button"
                  onClick={autoTranslateExample}
                  disabled={busy !== "" || !example.trim()}
                  className="btn btn-ghost px-3 py-1.5 text-xs whitespace-nowrap"
                >
                  {busy === "exTranslate" ? "翻譯中…" : "🔍 譯例句"}
                </button>
              </div>
            </div>
          </div>

          {/* 克漏字 */}
          {cardType === "cloze" && (
            <div>
              <label className="text-xs font-bold text-[var(--text-muted)] mb-1 block">克漏字句子（用 [...] 挖空）</label>
              <input
                value={clozeText}
                onChange={e => setClozeText(e.target.value)}
                placeholder="例如：Ella [...] muy bien el español."
                className="w-full border-2 rounded-2xl px-3 py-2 text-sm bg-white"
              />
            </div>
          )}

          {/* 標籤 */}
          <div>
            <label className="text-xs font-bold text-[var(--text-muted)] mb-1 block">標籤（逗號分隔）</label>
            <input
              value={tags}
              onChange={e => setTags(e.target.value)}
              placeholder="例如：動詞, 日常, A1"
              className="w-full border-2 rounded-2xl px-3 py-2 text-sm bg-white"
            />
          </div>
        </div>

        {/* 底部按鈕 */}
        <div className="flex justify-end gap-2.5 mt-6 pt-3 border-t border-[var(--border)]">
          <button onClick={onCancel} className="btn btn-ghost px-4 py-2 text-sm">
            取消
          </button>
          <button
            onClick={save}
            disabled={saving || !front.trim() || !back.trim()}
            className="btn btn-primary px-6 py-2 text-sm shadow-sm"
          >
            {saving ? "儲存中…" : "✓ 儲存卡片"}
          </button>
        </div>
      </div>
    </div>
  );
}