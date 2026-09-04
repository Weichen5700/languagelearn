"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCaptureSync } from "@/lib/capture/useCaptureSync";
import { listCards } from "@/lib/db";
import { loadSettings } from "@/lib/store/settings";
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

const LANG_NAMES: Record<string, { label: string; flag: string }> = {
  es: { label: "西班牙文", flag: "🇪🇸" },
  en: { label: "英文", flag: "🇬🇧" },
  zh: { label: "中文", flag: "🇹🇼" },
  ja: { label: "日文", flag: "🇯🇵" },
  ko: { label: "韓文", flag: "🇰🇷" },
  fr: { label: "法文", flag: "🇫🇷" },
  de: { label: "德文", flag: "🇩🇪" },
};

export default function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const capture = useCaptureSync();
  const [dueCount, setDueCount] = useState<number>(0);
  const [targetLang, setTargetLang] = useState<string>("es");

  useEffect(() => {
    let alive = true;
    async function loadQuickInfo() {
      try {
        const s = loadSettings();
        if (alive) setTargetLang(s.targetLang || "es");
        const cards = await listCards();
        const now = Date.now();
        const due = cards.filter(c => c.srs.due <= now).length;
        if (alive) setDueCount(due);
      } catch {
        // ignore
      }
    }
    loadQuickInfo();
    const interval = setInterval(loadQuickInfo, 10000);
    return () => { alive = false; clearInterval(interval); };
  }, [path]);

  const langInfo = LANG_NAMES[targetLang] ?? { label: targetLang.toUpperCase(), flag: "🌐" };

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur shadow-xs border-b border-[var(--border)]">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between gap-3">
          <Link href="/" className="font-extrabold text-lg flex items-center gap-1.5 shrink-0 group">
            <span className="text-2xl transition-transform group-hover:scale-110">🦉</span>
            <div className="flex flex-col leading-tight">
              <span className="text-base font-black">
                <span className="text-[var(--brand)]">外語</span>學
              </span>
              <span className="text-[10px] text-[var(--text-muted)] font-normal hidden sm:inline">
                FSRS 間隔複習
              </span>
            </div>
          </Link>

          <nav className="flex items-center gap-1 overflow-x-auto py-1 px-1 scrollbar-none">
            {NAV.map(n => {
              const active = path === n.href || (n.href !== "/" && path?.startsWith(n.href));
              const isCardTab = n.href === "/cards";
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  className={`px-3 py-1.5 rounded-full text-sm font-bold whitespace-nowrap transition-all flex items-center gap-1 ${
                    active
                      ? "bg-[var(--brand)] text-white shadow-sm scale-105"
                      : "text-[var(--text-muted)] hover:bg-[var(--brand-light)] hover:text-[var(--brand-dark)]"
                  }`}
                >
                  <span>{n.emoji}</span>
                  <span>{n.label}</span>
                  {isCardTab && dueCount > 0 && (
                    <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-black ml-0.5 ${
                      active ? "bg-white text-[var(--brand-dark)]" : "bg-[var(--accent-pink)] text-white"
                    }`}>
                      {dueCount}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>

          <div className="flex items-center gap-2 shrink-0">
            <Link
              href="/settings"
              title={`目前學習目標語：${langInfo.label}（點擊前往設定）`}
              className="text-xs px-2.5 py-1 rounded-full font-bold bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100 transition-colors flex items-center gap-1"
            >
              <span>{langInfo.flag}</span>
              <span className="hidden md:inline">{langInfo.label}</span>
            </Link>

            <span
              title={`沉浸擷取同步：${capture.connected ? "已連線" : "離線"}${capture.merged ? ` · 本次匯入 ${capture.merged} 字` : ""}`}
              className={`text-xs px-2.5 py-1 rounded-full whitespace-nowrap font-medium transition-colors ${
                capture.connected
                  ? "bg-green-100 text-green-700 border border-green-300"
                  : "bg-gray-100 text-gray-500 border border-gray-200"
              }`}
            >
              🎬 {capture.connected ? "同步中" : "離線"}
              {capture.merged > 0 ? ` · +${capture.merged}` : ""}
            </span>
          </div>
        </div>
      </header>
      <main className="max-w-5xl mx-auto px-4 py-6">
        <ReviewReminder />
        {children}
      </main>
      <footer className="text-center text-xs text-[var(--text-muted)] py-6 border-t border-[var(--border)] mt-12">
        🦉 外語學習平台 · FSRS 間隔複習 · 離線優先 · 語境與字典整合
      </footer>
    </div>
  );
}