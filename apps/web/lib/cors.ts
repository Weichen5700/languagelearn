import { NextResponse } from "next/server";

/**
 * 跨域標頭：Chrome 擴充 content script 跑在 youtube.com，對本機 localhost 是跨域，
 * 瀏覽器會做 CORS 檢查。所有擴充會呼叫的 API route 都要帶這些標頭，
 * 否則擴充收到「Failed to fetch」→ 顯示 ✗。
 *
 * 本機單使用者，允許任意來源；Private Network Access 標頭讓 localhost 預檢也放行。
 */
const ORIGIN = "*";

export function cors(res: NextResponse): NextResponse {
  res.headers.set("Access-Control-Allow-Origin", ORIGIN);
  res.headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.headers.set("Access-Control-Allow-Headers", "Content-Type");
  res.headers.set("Access-Control-Allow-Private-Network", "true");
  res.headers.set("Access-Control-Max-Age", "86400");
  return res;
}

export function options(): NextResponse {
  return cors(new NextResponse(null, { status: 204 }));
}