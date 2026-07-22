import { listCards, listDecks, saveCard, createDeck, deleteCard, deleteDeck } from "@/lib/db";
import type { Card, Deck } from "@/lib/schemas";

/** 匯出全部資料為 JSON（可攜帶、可重匯入）。 */
export async function exportAll(): Promise<string> {
  const [cards, decks] = await Promise.all([listCards(), listDecks()]);
  return JSON.stringify({ version: 1, exportedAt: Date.now(), decks, cards }, null, 2);
}

interface ExportBundle {
  version?: number;
  decks?: Deck[];
  cards?: Card[];
}

/** 匯入 JSON；id 衝突時跳過（已存在就不覆蓋）。 */
export async function importAll(json: string): Promise<{ decks: number; cards: number }> {
  const data = JSON.parse(json) as ExportBundle;
  let deckCount = 0, cardCount = 0;
  for (const d of data.decks ?? []) {
    const existing = await listDecks();
    if (!existing.find(x => x.id === d.id)) {
      await createDeck(d);
      deckCount++;
    }
  }
  for (const c of data.cards ?? []) {
    const existing = await listCards();
    if (!existing.find(x => x.id === c.id)) {
      await saveCard(c);
      cardCount++;
    }
  }
  return { decks: deckCount, cards: cardCount };
}

/** 全清（含 decks + cards）。匯入前常用。 */
export async function wipeAll(): Promise<void> {
  const decks = await listDecks();
  for (const d of decks) await deleteDeck(d.id);
}

export { deleteCard, deleteDeck };