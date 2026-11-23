import { getVaultLive } from "@/lib/serverData";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ address: string }> }
) {
  const { address } = await params;
  return Response.json(getVaultLive(address));
}
