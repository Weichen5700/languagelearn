import { NextRequest, NextResponse } from "next/server";
import { resolveTtsProvider } from "@/services/tts";
import { z } from "zod";

export const runtime = "nodejs";

const BodySchema = z.object({
  text: z.string().min(1).max(1000),
  voice: z.string(),
  lang: z.string(),
});

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { text, voice, lang } = parsed.data;

  const provider = resolveTtsProvider();

  if (provider.name === "browser") {
    return NextResponse.json({ browser: true, voice, lang });
  }

  try {
    const buf = await provider.synthesize(text, voice, lang);
    return new NextResponse(buf as unknown as BodyInit, {
      status: 200,
      headers: {
        "content-type": "audio/mpeg",
        "cache-control": "public, max-age=31536000, immutable",
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "tts failed";
    return NextResponse.json({ error: msg, provider: provider.name }, { status: 502 });
  }
}