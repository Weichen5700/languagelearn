import { listCards, saveCard, addLog } from "@/lib/db";
import { loadSettings } from "@/lib/store/settings";
import { newCard, review, type Rating, type SrsCard } from "@/lib/srs";
import type { Card } from "@/lib/schemas";

/**
 * 複習佇列：交錯新卡與到期複習卡，遵守每日上限。
 *
 * 新卡學習步驟：評 Again -> 1 分鐘後再出現；評 Good -> 10 分鐘後再出現；
 * 通過 10 分鐘步驟才進入 review 狀態，之後才計入「新卡完成」。
 */

export interface QueueItem {
  card: Card;
  kind: "new" | "learning" | "review";
}

export async function buildReviewQueue(deckId?: string): Promise<QueueItem[]> {
  const settings = loadSettings();
  const now = Date.now();
  const all = await listCards(deckId);

  const dueReviews: Card[] = [];
  const newCards: Card[] = [];
  const learning: Card[] = [];

  for (const c of all) {
    const s = c.srs;
    if (s.state === "new") {
      newCards.push(c);
    } else if (s.state === "learning" || s.state === "relearning") {
      if (now >= s.due) learning.push(c);
    } else if (s.state === "review") {
      if (now >= s.due) dueReviews.push(c);
    }
  }

  const reviews = dueReviews.slice(0, settings.reviewsPerDay);
  const news = newCards.slice(0, settings.newCardsPerDay);

  // 交錯：先 review，再穿插 new，避免一連串新卡疲勞
  const queue: QueueItem[] = [];
  const maxLen = Math.max(reviews.length, news.length, learning.length);
  for (let i = 0; i < maxLen; i++) {
    if (i < learning.length) queue.push({ card: learning[i], kind: "learning" });
    if (i < reviews.length) queue.push({ card: reviews[i], kind: "review" });
    if (i < news.length) queue.push({ card: news[i], kind: "new" });
  }
  return queue;
}

/**
 * 對一張卡評分並回傳更新後的 Card（含新 srs 狀態 + due）。
 * 也寫入 logEntries（含 timeSpentMs）。
 */
export async function gradeCard(
  card: Card,
  rating: Rating,
  timeSpentMs: number,
): Promise<Card> {
  const srsCard: SrsCard = {
    stability: card.srs.stability,
    difficulty: card.srs.difficulty,
    lastReview: card.srs.lastReview,
    reps: card.srs.reps,
    lapses: card.srs.lapses,
    state: card.srs.state,
  };
  const settings = loadSettings();
  const result = review(srsCard, rating, Date.now(), settings.requestRetention);

  const updated: Card = {
    ...card,
    srs: {
      stability: result.card.stability,
      difficulty: result.card.difficulty,
      lastReview: result.card.lastReview,
      reps: result.card.reps,
      lapses: result.card.lapses,
      state: result.card.state,
      due: result.due,
    },
    updatedAt: Date.now(),
  };
  await saveCard(updated);
  await addLog({
    id: crypto.randomUUID(),
    cardId: card.id,
    action: card.srs.state === "new" ? "learn" : "review",
    rating,
    timeSpentMs,
    ts: Date.now(),
  });
  return updated;
}

/** 新增卡片時以 newCard() 初始化 srs 狀態（due = 0 = 立即可複習）。 */
export function makeNewCardSrs() {
  const s = newCard();
  return { ...s, due: 0 };
}