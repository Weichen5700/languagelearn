"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import ReviewSession from "@/components/ReviewSession";

function ReviewContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const deckId = searchParams.get("deckId") || undefined;

  return (
    <ReviewSession
      deckId={deckId}
      onExit={() => router.push("/cards")}
    />
  );
}

export default function ReviewPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-[var(--text-muted)]">載入複習佇列中…</div>}>
      <ReviewContent />
    </Suspense>
  );
}
