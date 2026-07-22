import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { parse } from "yaml";

const VoiceSchema = z.object({
  id: z.string(),
  gender: z.enum(["male", "female", "neutral"]).optional(),
  provider: z.enum(["google", "azure", "openai", "browser", "elevenlabs"]),
});

export const LanguagePackSchema = z.object({
  code: z.string(),
  name: z.string(),
  nativeName: z.string(),
  flag: z.string().optional(),
  tts: z.object({
    voices: z.array(VoiceSchema),
    defaultVoice: z.string(),
  }),
  asr: z.object({
    provider: z.enum(["browser", "azure", "whisper"]),
    lang: z.string().optional(),
  }),
  ipa: z.boolean(),
  direction: z.enum(["ltr", "rtl"]),
  dictionary: z.object({
    provider: z.enum(["freedict", "wordnik", "jisho", "local"]),
  }),
  note: z.string().optional(),
});

export type LanguagePack = z.infer<typeof LanguagePackSchema>;
export type LangCode = string;

let cache: Record<string, LanguagePack> | null = null;

// apps/web 是 cwd；data/languages 在專案根（../..）
const LANG_DIR = join(process.cwd(), "..", "..", "data", "languages");

function loadAll(): Record<string, LanguagePack> {
  if (cache) return cache;
  const out: Record<string, LanguagePack> = {};
  for (const f of readdirSync(LANG_DIR)) {
    if (!f.endsWith(".yaml")) continue;
    const raw = parse(readFileSync(join(LANG_DIR, f), "utf8"));
    const parsed = LanguagePackSchema.parse(raw);
    out[parsed.code] = parsed;
  }
  cache = out;
  return out;
}

export function getLanguages(): LanguagePack[] {
  return Object.values(loadAll());
}

export function getLanguage(code: string): LanguagePack | undefined {
  return loadAll()[code];
}