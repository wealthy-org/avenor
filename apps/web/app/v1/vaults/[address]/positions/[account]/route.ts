export async function GET(
  _request: Request,
  { params }: { params: Promise<{ address: string; account: string }> }
) {
  const { account } = await params;
  return Response.json({
    account,
    shares: "0",
    firstSeenBlock: "118337511",
    lastActivityBlock: "118337652",
    source: "indexed",
  });
}
