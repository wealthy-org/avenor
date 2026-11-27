import { getVaultAllocation } from "@/lib/serverData";

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
    return Response.json(await getVaultAllocation(address));
  } catch (error) {
    return Response.json(
      { error: { code: "not_found", message: error instanceof Error ? error.message : String(error) } },
      { status: 404 }
    );
  }
}
