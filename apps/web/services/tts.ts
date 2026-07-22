import type { LangCode } from "@/lib/i18n/languages";

export interface TtsProvider {
  name: string;
  synthesize(text: string, voice: string, lang: LangCode): Promise<Uint8Array>;
}

export class GoogleTtsProvider implements TtsProvider {
  name = "google";
  constructor(private apiKey: string) {}

  async synthesize(text: string, voice: string, lang: LangCode): Promise<Uint8Array> {
    const url = `https://texttospeech.googleapis.com/v1/text:synthesize?key=${this.apiKey}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        input: { text },
        voice: { languageCode: lang, name: voice },
        audioConfig: { audioEncoding: "MP3" },
      }),
    });
    if (!res.ok) throw new Error(`Google TTS error ${res.status}`);
    const data = await res.json();
    const b64 = data.audioContent as string;
    return new Uint8Array(Buffer.from(b64, "base64"));
  }
}

export class BrowserTtsProvider implements TtsProvider {
  name = "browser";
  async synthesize(): Promise<Uint8Array> {
    return new Uint8Array(0);
  }
}

export function resolveTtsProvider(): TtsProvider {
  const key = process.env.GOOGLE_API_KEY;
  if (key && key.length > 0) return new GoogleTtsProvider(key);
  return new BrowserTtsProvider();
}