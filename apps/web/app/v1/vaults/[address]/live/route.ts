import { getVaultLive } from "@/lib/serverData";

// Every field in this payload is read for this request; caching would let a stale block answer.
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ address: string }> }
) {
  const { address } = await params;
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
    return Response.json(
      { error: { code: "invalid_address", message: "not a 20-byte hex address" } },
      { status: 400 }
    );
  }
  try {
    const live = await getVaultLive(address);
    if (!live) {
      return Response.json(
        { error: { code: "not_found", message: "vault not found or has no live data" } },
        { status: 404 }
      );
    }
    return Response.json(live);
  } catch (error) {
    // A vault that did not answer is a failure with the node's reason, not a 500 page: the loader turns
    // this body into a section-level error so the rest of the vault page still renders.
    return Response.json(
      { error: { code: "rpc", message: error instanceof Error ? error.message : String(error) } },
      { status: 502 }
    );
  }
}
