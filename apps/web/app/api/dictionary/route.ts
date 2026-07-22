import { NextRequest, NextResponse } from "next/server";
import { resolveDictionaryProvider } from "@/services/dictionary";
import { getLanguage } from "@/lib/i18n/languages";
import { z } from "zod";

export const runtime = "nodejs";

const BodySchema = z.object({
  word: z.string().min(1).max(200),
  lang: z.string(),
});

export async function POST(req: NextRequest) {
  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "invalid json" }, { status: 400 }); }
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { word, lang } = parsed.data;
  const pack = getLanguage(lang);
  const providerName = pack?.dictionary.provider ?? "freedict";
  const provider = resolveDictionaryProvider(providerName);
  try {
    const entry = await provider.lookup(word, lang);
    return NextResponse.json({ entry, provider: providerName });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "lookup failed";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}