export interface DictResult {
  word: string;
  ipa?: string;
  partOfSpeech?: string;
  definitions: string[];
  examples?: { text: string; translation?: string }[];
}

export async function lookupWord(word: string, lang: string): Promise<DictResult | null> {
  const res = await fetch("/api/dictionary", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ word, lang }),
  });
  const data = await res.json();
  if (data.error || !data.entry) return null;
  return data.entry as DictResult;
}