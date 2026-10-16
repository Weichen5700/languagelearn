import { NextRequest, NextResponse } from "next/server";
import { validateVisitBody, recordVisit, listVisits, isVisitsPersistent } from "@/lib/capture/visits";

export const runtime = "nodejs";
const ORIGIN = "*";

function cors(res: NextResponse): NextResponse {
  res.headers.set("Access-Control-Allow-Origin", ORIGIN);
  res.headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.headers.set("Access-Control-Allow-Headers", "Content-Type");
  return res;
}

export async function OPTIONS() {
  return cors(new NextResponse(null, { status: 204 }));
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try { body = await req.json(); }
  catch { return cors(NextResponse.json({ error: "invalid json" }, { status: 400 })); }
  const parsed = validateVisitBody(body);
  if (!parsed.success) return cors(NextResponse.json({ error: parsed.error.flatten() }, { status: 400 }));
  return cors(NextResponse.json({ visit: recordVisit(parsed.data), persistent: isVisitsPersistent() }, { status: 201 }));
}

export async function GET() {
  return cors(NextResponse.json({ visits: listVisits(), persistent: isVisitsPersistent() }));
}