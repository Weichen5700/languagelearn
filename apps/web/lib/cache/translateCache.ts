import { z } from "zod";

export const TranslateCacheSchema = z.object({
  hash: z.string(),
  text: z.string(),
  from: z.string(),
  to: z.string(),
  result: z.string(),
  createdAt: z.number(),
});

export type TranslateCacheEntry = z.infer<typeof TranslateCacheSchema>;

export function hashKey(text: string, from: string, to: string): string {
  return `${from}:${to}:${text}`;
}

const mem = new Map<string, TranslateCacheEntry>();

export function getCachedTranslation(text: string, from: string, to: string): TranslateCacheEntry | undefined {
  return mem.get(hashKey(text, from, to));
}

export function setCachedTranslation(entry: TranslateCacheEntry): void {
  mem.set(entry.hash, entry);
}