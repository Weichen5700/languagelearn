/**
 * 客戶端翻譯：呼叫後端 /api/translate（後端有快取 + provider 切換）。
 */
export interface TranslateResult {
  result: string;
  cached: boolean;
  provider: string;
}

export async function translateText(text: string, from: string, to: string): Promise<TranslateResult> {
  const res = await fetch("/api/translate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text, from, to }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return { result: data.result, cached: data.cached, provider: data.provider };
}