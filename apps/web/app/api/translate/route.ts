import { NextRequest, NextResponse } from "next/server";
import { resolveTranslateProvider } from "@/services/translate";
import { getCachedTranslation, setCachedTranslation, hashKey } from "@/lib/cache/translateCache";
import { cors, options } from "@/lib/cors";
import { z } from "zod";

export const runtime = "nodejs";

export { options as OPTIONS };

const BodySchema = z.object({
  text: z.string().min(1).max(5000),
  from: z.string(),
  to: z.string(),
});

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return cors(NextResponse.json({ error: "invalid json" }, { status: 400 }));
  }
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return cors(NextResponse.json({ error: parsed.error.flatten() }, { status: 400 }));
  }
  const { text, from, to } = parsed.data;

  const cached = getCachedTranslation(text, from, to);
  if (cached) {
    return cors(NextResponse.json({ result: cached.result, cached: true, provider: "cache" }));
  }

  const provider = await resolveTranslateProvider();
  try {
    const result = await provider.translate(text, from, to);
    setCachedTranslation({
      hash: hashKey(text, from, to),
      text, from, to, result,
      createdAt: Date.now(),
    });
    return cors(NextResponse.json({ result, cached: false, provider: provider.name }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "translate failed";
    return cors(NextResponse.json({ error: msg, provider: provider.name }, { status: 502 }));
  }
}