import { NextResponse } from "next/server";
import { getLanguages } from "@/lib/i18n/languages";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ languages: getLanguages() });
}