"use client";

import { useEffect, useState } from "react";
import { listCards } from "@/lib/db";
import {
  alreadyNotifiedToday,
  markNotifiedToday,
  ensurePermission,
  fireNotification,
} from "@/lib/notifications/notifications";

/**
 * 複習提醒橫幅 + 瀏覽器 Notification。
 * 進站時檢查 FSRS 到期卡數；>0 且當日未通知過 → 顯示橫幅、發 Notification（每日一次）。
 */
export default function ReviewReminder() {
  const [due, setDue] = useState<number | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const now = Date.now();
      const cards = await listCards();
      const count = cards.filter((c) => c.srs.due <= now).length;
      if (!alive) return;
      setDue(count);
      if (count > 0 && !alreadyNotifiedToday()) {
        // 先確保權限，再發通知（首次會跳出授權詢問）
        const perm = await ensurePermission();
        if (perm === "granted") {
          fireNotification(
            "🦉 該複習了！",
            `今天有 ${count} 張卡片待複習，點擊開始。`,
            () => { try { window.focus(); window.location.href = "/cards/review"; } catch { /* ignore */ } },
          );
        }
        markNotifiedToday();   // 無論有無權限，當日只提示一次
      }
    })();
    return () => { alive = false; };
  }, []);

  if (due === null || due === 0 || dismissed) return null;

  return (
    <div className="max-w-5xl mx-auto px-4 mt-3">
      <div className="flex items-center gap-3 bg-[var(--brand-light)] border-2 border-[var(--brand)] rounded-2xl px-4 py-2 text-sm">
        <span className="text-lg">🔔</span>
        <span className="font-bold">
          今天有 <span className="text-[var(--brand)]">{due}</span> 張卡片待複習
        </span>
        <a href="/cards/review" className="ml-auto btn btn-primary px-3 py-1 text-xs">立即複習</a>
        <button onClick={() => setDismissed(true)} className="text-[var(--text-muted)] hover:text-[var(--text)] text-xs">✕</button>
      </div>
    </div>
  );
}