import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  listKeyStatuses,
  setKey,
  deleteKey,
  isStoreWritable,
  KeyStoreReadOnlyError,
} from "@/lib/keys/store";

export const runtime = "nodejs";

/**
 * API Key 託管介面：
 * - GET：回傳遮罩清單（set / source）與 store 是否可寫，永不回傳明文。
 * - POST：設定某個 key（body: { name, value }）。
 * - DELETE：刪除某個 key（body: { name }）。
 *
 * 本機單使用者；host_permissions 限 localhost，不開外網。
 * 唯讀檔案系統（Vercel 等）無法站內保存 → 409 並提示改用環境變數。
 */
export async function GET() {
  return NextResponse.json({ keys: listKeyStatuses(), writable: isStoreWritable() });
}

const PostSchema = z.object({
  name: z.string().min(1).max(64),
  value: z.string().max(2000),
});

export async function POST(req: NextRequest) {
  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const parsed = PostSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  try {
    setKey(parsed.data.name, parsed.data.value);
    return NextResponse.json({ ok: true, keys: listKeyStatuses() });
  } catch (err) {
    if (err instanceof KeyStoreReadOnlyError) {
      return NextResponse.json({ error: err.message, writable: false }, { status: 409 });
    }
    const msg = err instanceof Error ? err.message : "save failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

const DeleteSchema = z.object({ name: z.string().min(1).max(64) });

export async function DELETE(req: NextRequest) {
  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const parsed = DeleteSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  try {
    deleteKey(parsed.data.name);
    return NextResponse.json({ ok: true, keys: listKeyStatuses() });
  } catch (err) {
    if (err instanceof KeyStoreReadOnlyError) {
      return NextResponse.json({ error: err.message, writable: false }, { status: 409 });
    }
    const msg = err instanceof Error ? err.message : "delete failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}