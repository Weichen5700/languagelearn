import { captureBus, type CaptureEntry } from "@/lib/capture/staging";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * SSE：網站開啟時連線，即時接收新擷取（擴充點字幕 → 本站自動建卡）。
 * 連線時先送一個 ready 事件，前端收到後再 GET /api/capture 補傳離線期間 pending。
 */
export async function GET() {
  const encoder = new TextEncoder();
  let ping: ReturnType<typeof setInterval> | undefined;
  let onCapture: ((entry: CaptureEntry) => void) | undefined;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (name: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${name}\ndata: ${JSON.stringify(data)}\n\n`));
      };
      send("ready", { ts: Date.now() });

      onCapture = (entry: CaptureEntry) => send("capture", entry);
      captureBus.on("capture", onCapture);

      ping = setInterval(() => {
        try { controller.enqueue(encoder.encode(`: ping\n\n`)); } catch { /* closed */ }
      }, 30000);
    },
    cancel() {
      if (ping) clearInterval(ping);
      if (onCapture) captureBus.off("capture", onCapture);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*",
    },
  });
}