/**
 * 字串相似度（用於發音比對）。
 *
 * MVP：以 Levenshtein 編輯距離正規化為 0–100 分。
 * 進階可換 MFCC + DTW（音訊特徵層級，更準但較重）。
 */

/** Levenshtein 編輯距離（DP）。 */
export function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const prev = new Array<number>(n + 1);
  const curr = new Array<number>(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= n; j++) prev[j] = curr[j];
  }
  return prev[n];
}

/** 正規化相似度分數（0–100）。100 = 完全相同。 */
export function similarityScore(expected: string, actual: string): number {
  const e = expected.trim().toLowerCase();
  const a = actual.trim().toLowerCase();
  if (e.length === 0 && a.length === 0) return 100;
  const dist = levenshtein(e, a);
  const maxLen = Math.max(e.length, a.length);
  return Math.round((1 - dist / maxLen) * 100);
}

/** 字元錯誤率（CER），0 = 完美，1 = 全錯。 */
export function charErrorRate(expected: string, actual: string): number {
  const e = expected.trim();
  const a = actual.trim();
  if (e.length === 0 && a.length === 0) return 0;
  return levenshtein(e, a) / Math.max(e.length, a.length);
}

/** 依分數給等級標籤。 */
export function gradeLabel(score: number): { label: string; color: string } {
  if (score >= 90) return { label: "優秀", color: "text-green-600" };
  if (score >= 75) return { label: "良好", color: "text-blue-600" };
  if (score >= 60) return { label: "尚可", color: "text-orange-600" };
  return { label: "再練習", color: "text-red-600" };
}