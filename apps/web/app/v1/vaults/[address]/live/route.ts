import { getVaultLive } from "@/lib/serverData";

// Every field in this payload is read for this request; caching would let a stale block answer.
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ address: string }> }
) {
  const { address } = await params;
  try {
    return Response.json(await getVaultLive(address));
  } catch (error) {
    // A vault that did not answer is a failure with the node's reason, not a 500 page: the loader turns
    // this body into a section-level error so the rest of the vault page still renders.
    return Response.json(
      { error: { code: "rpc", message: error instanceof Error ? error.message : String(error) } },
      { status: 502 }
    );
  }
}
