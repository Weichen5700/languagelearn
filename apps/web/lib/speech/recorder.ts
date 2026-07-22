/**
 * MediaRecorder 包裝：錄製麥克風音訊，回傳 Blob。
 * 瀏覽器環境專用（需 getUserMedia）。
 */

export interface Recorder {
  start(): Promise<void>;
  stop(): Promise<Blob>;
  isRecording(): boolean;
}

export async function createRecorder(mimeType = "audio/webm"): Promise<Recorder> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    throw new Error("此環境不支援麥克風錄音");
  }
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  let recorder: MediaRecorder | null = null;
  let chunks: Blob[] = [];
  let recording = false;
  let resolveStop: ((b: Blob) => void) | null = null;

  return {
    async start() {
      chunks = [];
      recorder = new MediaRecorder(stream, { mimeType: MediaRecorder.isTypeSupported(mimeType) ? mimeType : undefined });
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
      recorder.onstop = () => {
        recording = false;
        const blob = new Blob(chunks, { type: recorder?.mimeType ?? "audio/webm" });
        resolveStop?.(blob);
      };
      recorder.start();
      recording = true;
    },
    stop() {
      return new Promise<Blob>((resolve) => {
        resolveStop = resolve;
        recorder?.stop();
      });
    },
    isRecording() { return recording; },
  };
}