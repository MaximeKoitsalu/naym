import { notFound } from "next/navigation";
import DuelsPlay from "@/components/Duels";
import { getDuelsView } from "@/lib/duels";
import { getShortlistView } from "@/lib/shortlist";

export default async function DuelsRoute({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [view, duels] = await Promise.all([getShortlistView(token), getDuelsView(token)]);
  if (!view || !duels) notFound();
  return <DuelsPlay token={token} initial={duels} entries={view.entries} />;
}
