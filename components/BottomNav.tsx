"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { lastShortlist } from "@/lib/shortlist-device";

/*
  Swipe (what's next) · Our names (the Shortlist) · Us (settings and links),
  once this device remembers a Shortlist.
  Hidden on /s/* — swiping, handoff and the reveal keep the whole screen,
  and the swipe deck's decision row stays the only thing on the action axis.
*/
export default function BottomNav() {
  const path = usePathname();
  const search = useSearchParams();
  const [home, setHome] = useState<string | null>(null);
  // Re-read on every route change: opening a Shortlist is what remembers it.
  useEffect(() => setHome(lastShortlist()), [path]);
  if (!home || path.startsWith("/s/")) return null;

  // "/" is only "Swipe" when it's dealing onto this Shortlist; a bare "/" starts a new couple.
  const dealing = path === "/" && search.has("deal");
  const tabs = [
    // A redirect route, not a page — nothing worth prefetching.
    { href: `${home}/swipe`, label: "Swipe", active: dealing, prefetch: false },
    { href: home, label: "Our names", active: path === home || path === `${home}/duels` },
    { href: `${home}/us`, label: "Us", active: path === `${home}/us` },
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
          prefetch={"prefetch" in t ? t.prefetch : undefined}
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
