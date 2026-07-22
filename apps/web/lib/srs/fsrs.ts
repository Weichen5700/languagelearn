/**
 * FSRS-4.5 間隔複習演算法（簡化實作）。
 *
 * 比起 SM-2，FSRS 以記憶穩定性（stability）與難度（difficulty）建模，
 * 複習量約可減少 30%。採用標準 19 參數權重向量 w0..w18。
 *
 * 評分（Rating）：1=Again（不會）2=Hard 3=Good 4=Easy
 */

export type Rating = 1 | 2 | 3 | 4;
export type State = "new" | "learning" | "review" | "relearning";

export interface SrsCard {
  stability: number;
  difficulty: number;
  lastReview: number | null;
  reps: number;
  lapses: number;
  state: State;
}

export interface ReviewResult {
  card: SrsCard;
  intervalDays: number;
  due: number;
}

const W = [
  0.4072, 1.1829, 3.1262, 15.4722, 7.2102, 0.5316, 1.0651, 0.0234, 1.616, 0.1543,
  1.0824, 1.9813, 0.0953, 0.2975, 2.2042, 0.2407, 2.9466, 0.5034, 0.6567,
];

const DEFAULT_REQUEST_RETENTION = 0.9;
const DEFAULT_FACTOR = 19 / 81;
const DAY_MS = 24 * 60 * 60 * 1000;

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}

function intervalFromStability(stability: number, retention: number): number {
  return Math.max(1, Math.round(stability * (1 / retention - 1) / DEFAULT_FACTOR));
}

function initStability(r: Rating): number {
  return W[r - 1];
}

function initDifficulty(r: Rating): number {
  const d = W[4] - (r - 3) * W[5];
  return clamp(d, 1, 10);
}

function lapsesFactor(lapses: number): number {
  return Math.pow(0.9, Math.min(lapses, 5));
}

function nextStability(card: SrsCard, r: Rating): number {
  const { stability: s, difficulty: d } = card;
  const elapsedDays = card.lastReview ? Math.max(0.1, (Date.now() - card.lastReview) / DAY_MS) : 0.1;

  if (r === 1) {
    const factor = W[11] * Math.pow(d, -W[12]) * (Math.pow((s + 1) / (s + 1), W[13]) - 1);
    return Math.max(0.1, s * clamp(factor, 0.2, 1.0));
  }
  const hardPenalty = r === 2 ? W[15] : 1;
  const easyBonus = r === 4 ? W[16] : 1;
  const forgottenPenalty = lapsesFactor(card.lapses);
  const newS = s * (1 + W[17] * hardPenalty * easyBonus * forgottenPenalty *
                    Math.pow(elapsedDays / s, -W[18]) * 0.9);
  return Math.max(s * 0.5, newS);
}

function nextDifficulty(card: SrsCard, r: Rating): number {
  const target = clamp(card.difficulty - (r - 3) * W[6], 1, 10);
  return clamp(W[7] * card.difficulty + (1 - W[7]) * target, 1, 10);
}

export function newCard(): SrsCard {
  return {
    stability: 0.1,
    difficulty: 5,
    lastReview: null,
    reps: 0,
    lapses: 0,
    state: "new",
  };
}

export function review(
  card: SrsCard,
  rating: Rating,
  now: number = Date.now(),
  requestRetention: number = DEFAULT_REQUEST_RETENTION,
): ReviewResult {
  let next: SrsCard;

  if (card.state === "new") {
    next = {
      ...card,
      stability: initStability(rating),
      difficulty: initDifficulty(rating),
      lastReview: now,
      reps: card.reps + 1,
      state: rating === 1 ? "learning" : "review",
      lapses: rating === 1 ? card.lapses + 1 : card.lapses,
    };
  } else {
    next = {
      ...card,
      stability: nextStability(card, rating),
      difficulty: nextDifficulty(card, rating),
      lastReview: now,
      reps: card.reps + 1,
      state: rating === 1 ? "relearning" : "review",
      lapses: rating === 1 ? card.lapses + 1 : card.lapses,
    };
  }

  const intervalDays =
    next.state === "learning" || next.state === "relearning"
      ? rating === 1 ? 1 : rating === 2 ? 6 : 10
      : intervalFromStability(next.stability, requestRetention);

  const due = now + intervalDays * DAY_MS;
  return { card: next, intervalDays, due };
}