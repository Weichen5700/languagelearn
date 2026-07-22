import { NextRequest, NextResponse } from "next/server";
import {
  validateCaptureBody,
  addCapture,
  listPending,
  listAll,
  markImported,
  clearImported,
} from "@/lib/capture/staging";

export const runtime = "nodejs";
const ORIGIN = "*"; // 擴充來自 chrome-extension://，本地單機允許跨域

function cors(res: NextResponse): NextResponse {
  res.headers.set("Access-Control-Allow-Origin", ORIGIN);
  res.headers.set("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
  res.headers.set("Access-Control-Allow-Headers", "Content-Type");
  return res;
}

export async function OPTIONS() {
  return cors(new NextResponse(null, { status: 204 }));
}

/** POST 新增擷取；GET 列 pending（?all=1 列全部） */
export async function POST(req: NextRequest) {
  let body: unknown;
  try { body = await req.json(); }
  catch { return cors(NextResponse.json({ error: "invalid json" }, { status: 400 })); }
  const parsed = validateCaptureBody(body);
  if (!parsed.success) {
    return cors(NextResponse.json({ error: parsed.error.flatten() }, { status: 400 }));
  }
  const result = addCapture(parsed.data);
  return cors(NextResponse.json(result, { status: result.duplicate ? 200 : 201 }));
}

export async function GET(req: NextRequest) {
  const all = req.nextUrl.searchParams.get("all") === "1";
  const list = all ? listAll() : listPending();
  return cors(NextResponse.json({ entries: list }));
}

/** PATCH /api/capture?id=xxx（網站合併進 IndexedDB 後標 imported） */
export async function PATCH(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return cors(NextResponse.json({ error: "missing id" }, { status: 400 }));
  const ok = markImported(id);
  return cors(NextResponse.json({ ok }));
}

/** DELETE 清掉已 imported（保留 pending） */
export async function DELETE() {
  const removed = clearImported();
  return cors(NextResponse.json({ removed }));
}