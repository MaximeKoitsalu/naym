"use client";

import { useEffect, useState } from "react";
import { defaultWishGender, wishGenderLabel, WISH_GENDERS, type WishGender } from "@/lib/wishes";
import type { DeckGender } from "@/lib/deck-manifest";

/* Small controls shared by the builder, the Shortlist and the Us tab. */

export function Choice<T extends string>({
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

const WISH_GENDER_OPTIONS = WISH_GENDERS.map((value) => ({ value, label: wishGenderLabel(value) }));

/** Who a typed name is for: decks only take the wishes that fit their gender. */
export function WishGenderPick({ value, onChange }: { value: WishGender; onChange: (g: WishGender) => void }) {
  return <Choice legend="this name is for" options={WISH_GENDER_OPTIONS} value={value} onChange={onChange} />;
}

/**
 * The picker's value for a typed name: preset to who the couple is naming, or
 * to the curated tag once the name is one we know (Saga → girl). A pick the
 * partner makes wins until the name changes.
 */
export function useWishGender(name: string, expecting: DeckGender) {
  const [picked, setPicked] = useState<WishGender | null>(null);
  const [known, setKnown] = useState<WishGender | null>(null);
  useEffect(() => {
    setPicked(null);
    setKnown(null);
    if (!name.trim()) return;
    const t = setTimeout(() => {
      fetch(`/api/name-tag?name=${encodeURIComponent(name)}`)
        .then((r) => r.json())
        .then((b) => setKnown(b?.gender ?? null))
        .catch(() => null);
    }, 250);
    return () => clearTimeout(t);
  }, [name]);
  return [picked ?? known ?? defaultWishGender(expecting), setPicked] as const;
}
