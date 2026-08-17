import { NextResponse } from "next/server";
import { getLanguages } from "@/lib/i18n/languages";
import { cors, options } from "@/lib/cors";

export const runtime = "nodejs";

export { options as OPTIONS };

export async function GET() {
  return cors(NextResponse.json({ languages: getLanguages() }));
}