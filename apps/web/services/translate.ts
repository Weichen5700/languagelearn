import type { LangCode } from "@/lib/i18n/languages";
import { getKey } from "@/lib/keys/store";

export interface TranslateProvider {
  name: string;
  translate(text: string, from: LangCode, to: LangCode): Promise<string>;
}

export class GoogleTranslateProvider implements TranslateProvider {
  name = "google";
  constructor(private apiKey: string) {}

  async translate(text: string, from: LangCode, to: LangCode): Promise<string> {
    const url = `https://translation.googleapis.com/language/translate/v2?key=${this.apiKey}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ q: text, source: from, target: to, format: "text" }),
    });
    if (!res.ok) throw new Error(`Google Translate error ${res.status}`);
    const data = await res.json();
    return data.data.translations[0].translatedText as string;
  }
}

export class LibreTranslateProvider implements TranslateProvider {
  name = "libretranslate";
  constructor(private endpoint = "https://libretranslate.com/translate", private apiKey?: string) {}

  async translate(text: string, from: LangCode, to: LangCode): Promise<string> {
    const res = await fetch(this.endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ q: text, source: from, target: to, api_key: this.apiKey }),
    });
    if (!res.ok) throw new Error(`LibreTranslate error ${res.status}`);
    const data = await res.json();
    return data.translatedText as string;
  }
}

export async function resolveTranslateProvider(): Promise<TranslateProvider> {
  const key = (await getKey("GOOGLE_API_KEY")) ?? process.env.GOOGLE_API_KEY;
  if (key && key.length > 0) return new GoogleTranslateProvider(key);
  const endpoint = (await getKey("LIBRETRANSLATE_ENDPOINT")) ?? process.env.LIBRETRANSLATE_ENDPOINT;
  return new LibreTranslateProvider(endpoint);
}