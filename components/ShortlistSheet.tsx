"use client";

import { useEffect, useState } from "react";
import type { DeckGender } from "@/lib/deck-manifest";
import type { ShortlistFilter } from "@/lib/shortlist-filter";

/*
  The Shortlist sheet behind "filter & links" (#18, variant C): the expecting
  setting, the girl/boy/both filter, this partner's own link, and a fresh link for
  the other partner when theirs is lost.
*/

export function CopyLinkButton({
  token,
  autoFocus,
  label = "Copy my Shortlist link",
}: {
  token: string;
  autoFocus?: boolean;
  label?: string;
}) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    await navigator.clipboard
      .writeText(`${window.location.origin}/shortlist/${token}`)
      .then(() => setCopied(true))
      .catch(() => null);
  }
  return (
    <button
      onClick={copy}
      autoFocus={autoFocus}
      className="min-h-12 w-full rounded-full border border-ink-soft/25 px-6 font-medium"
    >
      {copied ? "Link copied" : label}
    </button>
  );
}

function Choice<T extends string>({
  legend,
  options,
  value,
  onChange,
}: {
  legend: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="pb-1 text-sm text-ink-soft">{legend}</legend>
      <div className="flex gap-2">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            aria-pressed={o.value === value}
            className={`min-h-11 flex-1 rounded-2xl border px-2 text-sm transition-colors ${
              o.value === value ? "border-terra bg-paper-dim text-terra-deep" : "border-ink-soft/25"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

/** Revokes the other partner's lost link; the fresh one is shown here only. */
function FreshPartnerLink({ token }: { token: string }) {
  const [step, setStep] = useState<"idle" | "confirm" | "busy" | "none">("idle");
  const [fresh, setFresh] = useState<string | null>(null);
  async function reissue() {
    setStep("busy");
    const res = await fetch("/api/shortlist/reissue", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token }),
    }).catch(() => null);
    const body = res?.ok ? await res.json() : null;
    if (body?.token) setFresh(body.token);
    else setStep(res?.status === 404 ? "none" : "confirm");
  }
  if (fresh) {
    return (
      <div className="space-y-2">
        <p className="text-sm leading-relaxed text-ink-soft">
          Their old link no longer opens. Pass this one on — it&apos;s theirs alone.
        </p>
        <CopyLinkButton token={fresh} label="Copy my partner's fresh link" />
      </div>
    );
  }
  if (step === "none") {
    return <p className="text-sm text-ink-soft">Your partner hasn&apos;t joined yet — there&apos;s no link to replace.</p>;
  }
  if (step === "idle") {
    return (
      <button onClick={() => setStep("confirm")} className="min-h-11 w-full text-sm text-ink-soft underline">
        Send my partner a fresh link
      </button>
    );
  }
  return (
    <div className="space-y-2">
      <p className="text-sm leading-relaxed text-ink-soft">
        Lost their link? A fresh one stops the old one working. Yours stays the same.
      </p>
      <button
        onClick={reissue}
        disabled={step === "busy"}
        className="min-h-12 w-full rounded-full border border-ink-soft/25 px-6 font-medium"
      >
        Make a fresh link for my partner
      </button>
    </div>
  );
}

const EXPECTING_OPTIONS: { value: DeckGender; label: string }[] = [
  { value: "girl", label: "a girl" },
  { value: "boy", label: "a boy" },
  { value: "unsure", label: "not sure yet" },
];

const FILTER_OPTIONS: { value: ShortlistFilter; label: string }[] = [
  { value: "girl", label: "girl" },
  { value: "boy", label: "boy" },
  { value: "both", label: "both" },
];

export default function ShortlistSheet({
  token,
  expecting,
  onExpecting,
  filter,
  onFilter,
  onClose,
}: {
  token: string;
  expecting: DeckGender;
  onExpecting: (g: DeckGender) => void;
  filter: ShortlistFilter;
  onFilter: (f: ShortlistFilter) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-10 flex items-end bg-ink/30" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Shortlist filter and links"
        className="mx-auto w-full max-w-[480px] space-y-5 rounded-t-[20px] bg-paper p-6 pb-24"
        onClick={(e) => e.stopPropagation()}
      >
        <Choice legend="who are we naming?" options={EXPECTING_OPTIONS} value={expecting} onChange={onExpecting} />
        <Choice legend="show" options={FILTER_OPTIONS} value={filter} onChange={onFilter} />
        <p className="text-sm leading-relaxed text-ink-soft">
          This link is yours alone. Your partner has their own.
        </p>
        <CopyLinkButton token={token} autoFocus />
        <FreshPartnerLink token={token} />
        <button onClick={onClose} className="min-h-11 w-full text-sm text-ink-soft underline">
          close
        </button>
      </div>
    </div>
  );
}
