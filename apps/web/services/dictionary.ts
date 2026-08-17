import type { LangCode } from "@/lib/i18n/languages";

export interface DictionaryEntry {
  word: string;
  ipa?: string;                       // 音標（IPA）
  partOfSpeech?: string;              // 詞性（名詞/動詞/形容詞…）
  definitions: string[];
  examples?: { text: string; translation?: string }[];
}

export interface DictionaryProvider {
  name: string;
  lookup(word: string, lang: LangCode): Promise<DictionaryEntry | null>;
}

export class FreeDictProvider implements DictionaryProvider {
  name = "freedict";
  async lookup(word: string, lang: LangCode): Promise<DictionaryEntry | null> {
    const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/${lang}/${encodeURIComponent(word)}`);
    if (!res.ok) return null;
    const data = (await res.json()) as FreeDictResponse[];
    if (!Array.isArray(data) || data.length === 0) return null;
    const first = data[0];
    const defs: string[] = [];
    const examples: { text: string }[] = [];
    let partOfSpeech: string | undefined;
    for (const m of first.meanings ?? []) {
      if (!partOfSpeech && m.partOfSpeech) partOfSpeech = m.partOfSpeech;
      for (const d of m.definitions ?? []) {
        defs.push(d.definition);
        if (d.example) examples.push({ text: d.example });
      }
    }
    // IPA：優先取 phonetics 中有 text 者（skip 空 text），否則用 phonetic
    const ipa = pickIpa(first);
    return {
      word: first.word ?? word,
      ipa,
      partOfSpeech,
      definitions: defs,
      examples,
    };
  }
}

function pickIpa(entry: FreeDictResponse): string | undefined {
  const list = entry.phonetics;
  if (list && list.length) {
    const withText = list.find((p) => p?.text && p.text.trim());
    if (withText?.text) return withText.text.trim();
  }
  const ph = entry.phonetic;
  return ph && ph.trim() ? ph.trim() : undefined;
}

interface FreeDictPhonetic { text?: string; audio?: string }
interface FreeDictDefinition { definition: string; example?: string }
interface FreeDictMeaning { partOfSpeech?: string; definitions?: FreeDictDefinition[] }
interface FreeDictResponse { word?: string; phonetic?: string; phonetics?: FreeDictPhonetic[]; meanings?: FreeDictMeaning[] }

export function resolveDictionaryProvider(providerName: string): DictionaryProvider {
  if (providerName === "freedict") return new FreeDictProvider();
  throw new Error(`Unknown dictionary provider: ${providerName}`);
}