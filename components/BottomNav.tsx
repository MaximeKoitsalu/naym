"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { lastShortlist } from "@/lib/shortlist-device";

/*
  The way back to a couple's lists, once this device remembers a Shortlist.
  Hidden on /s/* — swiping, handoff and the reveal keep the whole screen,
  and the swipe deck's decision row stays the only thing on the action axis.
*/
export default function BottomNav() {
  const path = usePathname();
  const [home, setHome] = useState<string | null>(null);
  // Re-read on every route change: opening a Shortlist is what remembers it.
  useEffect(() => setHome(lastShortlist()), [path]);
  if (!home || path.startsWith("/s/")) return null;

  const tabs = [
    { href: home, label: "Our names", active: path === home },
    { href: `${home}/duels`, label: "This or that", active: path === `${home}/duels` },
    { href: `${home}/deal`, label: "New deck", active: path === "/" },
  ];
  return (
    <nav
      data-bottom-nav
      aria-label="Our lists"
      className="fixed inset-x-0 bottom-0 mx-auto grid w-full max-w-[480px] grid-cols-3 border-t border-ink-soft/15 bg-paper pb-[env(safe-area-inset-bottom)]"
    >
      {tabs.map((t) => (
        <Link
          key={t.label}
          href={t.href}
          // The deal link is a redirect route, not a page — skip the prefetch.
          prefetch={t.label === "New deck" ? false : undefined}
          aria-current={t.active ? "page" : undefined}
          className={`flex min-h-16 items-center justify-center text-sm font-medium ${
            t.active ? "text-terra-deep" : "text-ink-soft"
          }`}
        >
          <span className={t.active ? "border-b-2 border-terra pb-0.5" : "pb-0.5"}>{t.label}</span>
        </Link>
      ))}
    </nav>
  );
}
