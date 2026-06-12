import SessionClient from "@/components/SessionClient";

export default async function SessionPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  // GET renders a passive shell only — no state changes, nothing for a
  // link-preview prefetcher to consume. The B slot binds on the start tap.
  return <SessionClient token={token} />;
}
