import type { LangCode } from "@/lib/i18n/languages";

export interface DictionaryEntry {
  word: string;
  partOfSpeech?: string;
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
    for (const m of first.meanings ?? []) {
      for (const d of m.definitions ?? []) {
        defs.push(d.definition);
        if (d.example) examples.push({ text: d.example });
      }
    }
    return {
      word: first.word ?? word,
      partOfSpeech: first.meanings?.[0]?.partOfSpeech,
      definitions: defs,
      examples,
    };
  }
}

interface FreeDictDefinition { definition: string; example?: string }
interface FreeDictMeaning { partOfSpeech?: string; definitions?: FreeDictDefinition[] }
interface FreeDictResponse { word?: string; meanings?: FreeDictMeaning[] }

export function resolveDictionaryProvider(providerName: string): DictionaryProvider {
  if (providerName === "freedict") return new FreeDictProvider();
  throw new Error(`Unknown dictionary provider: ${providerName}`);
}