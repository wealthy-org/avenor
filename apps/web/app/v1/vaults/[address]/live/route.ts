import { getVaultLive } from "@/lib/serverData";

// Every field in this payload is read for this request; caching would let a stale block answer.
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ address: string }> }
) {
  const { address } = await params;
  return Response.json(await getVaultLive(address));
}
