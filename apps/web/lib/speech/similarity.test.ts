import { describe, it, expect } from "vitest";
import { levenshtein, similarityScore, charErrorRate, gradeLabel } from "./similarity";

describe("levenshtein", () => {
  it("相同字串距離 0", () => {
    expect(levenshtein("hola", "hola")).toBe(0);
  });
  it("空字串距離 = 另一字長度", () => {
    expect(levenshtein("", "hola")).toBe(4);
    expect(levenshtein("hola", "")).toBe(4);
  });
  it("插入/刪除/替換", () => {
    expect(levenshtein("hola", "ola")).toBe(1);     // 刪 h
    expect(levenshtein("hola", "holla")).toBe(1);   // 插 l
    expect(levenshtein("hola", "hola!")).toBe(1);   // 插 !
    expect(levenshtein("gato", "pato")).toBe(1);    // 替換
  });
  it("完全不相似", () => {
    expect(levenshtein("abc", "xyz")).toBe(3);
  });
});

describe("similarityScore", () => {
  it("完全相同 = 100", () => {
    expect(similarityScore("hola", "hola")).toBe(100);
  });
  it("大小寫不敏感", () => {
    expect(similarityScore("Hola", "hola")).toBe(100);
  });
  it("前後空白不敏感", () => {
    expect(similarityScore("  hola  ", "hola")).toBe(100);
  });
  it("一個錯誤字元對長字分數高", () => {
    const s = similarityScore("hola mundo", "hola mundx");
    expect(s).toBeGreaterThanOrEqual(80);
    expect(s).toBeLessThan(100);
  });
  it("完全不同 = 0", () => {
    expect(similarityScore("abc", "xyz")).toBe(0);
  });
  it("兩空字串 = 100", () => {
    expect(similarityScore("", "")).toBe(100);
  });
});

describe("charErrorRate", () => {
  it("完美 = 0", () => {
    expect(charErrorRate("hola", "hola")).toBe(0);
  });
  it("全錯 = 1", () => {
    expect(charErrorRate("abc", "xyz")).toBe(1);
  });
});

describe("gradeLabel", () => {
  it(">=90 優秀", () => {
    expect(gradeLabel(95).label).toBe("優秀");
  });
  it(">=75 良好", () => {
    expect(gradeLabel(80).label).toBe("良好");
  });
  it(">=60 尚可", () => {
    expect(gradeLabel(65).label).toBe("尚可");
  });
  it("<60 再練習", () => {
    expect(gradeLabel(40).label).toBe("再練習");
  });
});