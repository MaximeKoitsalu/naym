import { redirect } from "next/navigation";
import UsPanel from "@/components/Us";
import { getShortlistView, getWishes, resolvePartner } from "@/lib/shortlist";
import { getDealView } from "@/lib/session";

/** The "Us" tab: who we're naming, wishes, links. A read only. */
export default async function UsRoute({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [view, partner] = await Promise.all([getShortlistView(token), resolvePartner(token)]);
  if (!view || !partner) redirect(`/shortlist/${token}`); // its page explains a dead link
  const [wishes, deal] = await Promise.all([getWishes(partner.shortlistId), getDealView(token)]);
  return (
    <UsPanel
      key={token}
      token={token}
      partner={view.partner}
      expecting={view.expecting}
      wishes={wishes}
      wishesInDeck={deal?.wishes ?? []}
    />
  );
}
