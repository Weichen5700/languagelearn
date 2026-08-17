"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCaptureSync } from "@/lib/capture/useCaptureSync";
import ReviewReminder from "./ReviewReminder";

const NAV = [
  { href: "/", label: "首頁", emoji: "🏠" },
  { href: "/cards", label: "單字卡", emoji: "🎴" },
  { href: "/library", label: "知識庫", emoji: "📚" },
  { href: "/plans", label: "計畫", emoji: "📅" },
  { href: "/pronunciation", label: "發音", emoji: "🎤" },
  { href: "/stats", label: "統計", emoji: "📊" },
  { href: "/settings", label: "設定", emoji: "⚙️" },
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const capture = useCaptureSync();
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 bg-white/90 backdrop-blur border-b-2 border-[var(--border)]">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center gap-2">
          <Link href="/" className="font-extrabold text-lg flex items-center gap-1 mr-auto">
            <span className="text-2xl animate-bounce-soft">🦉</span>
            <span className="text-[var(--brand)]">外語</span>
            <span>學</span>
          </Link>
          <nav className="flex items-center gap-1 overflow-x-auto">
            {NAV.map(n => {
              const active = path === n.href || (n.href !== "/" && path?.startsWith(n.href));
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  className={`px-3 py-1.5 rounded-full text-sm font-bold whitespace-nowrap transition-all ${
                    active
                      ? "bg-[var(--brand)] text-white shadow"
                      : "text-[var(--text-muted)] hover:bg-[var(--brand-light)] hover:text-[var(--brand-dark)]"
                  }`}
                >
                  <span className="mr-1">{n.emoji}</span>{n.label}
                </Link>
              );
            })}
          </nav>
          <span
            title={`沉浸擷取同步：${capture.connected ? "已連線" : "離線"}${capture.merged ? ` · 本次匯入 ${capture.merged} 字` : ""}`}
            className={`text-xs px-2 py-1 rounded-full whitespace-nowrap ${
              capture.connected
                ? "bg-green-100 text-green-700"
                : "bg-gray-100 text-gray-500"
            }`}
          >
            🎬 {capture.connected ? "同步中" : "離線"}
            {capture.merged > 0 ? ` · +${capture.merged}` : ""}
          </span>
        </div>
      </header>
      <main className="max-w-5xl mx-auto px-4 py-6">
        <ReviewReminder />
        {children}
      </main>
      <footer className="text-center text-xs text-[var(--text-muted)] py-6">
        🦉 外語學習平台 · FSRS 間隔複習 · 離線優先 · 西班牙文為預設目標語
      </footer>
    </div>
  );
}