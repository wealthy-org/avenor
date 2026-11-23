import { getPosition } from "@/lib/serverData";

// The balance is read from the vault for this request. Nothing here is an indexer row, because no
// indexer is running: a share balance is a getter, and the block history of an account is not.
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ address: string; account: string }> }
) {
  const { address, account } = await params;
  const position = await getPosition(address, account);
  // A position that could not be read is not a zero position: it answers 502 with the reason, so the UI
  // shows the failure instead of a share balance of 0.
  if (position.error !== null) {
    return Response.json({ error: { code: "rpc", message: position.error } }, { status: 502 });
  }
  return Response.json(position);
}
