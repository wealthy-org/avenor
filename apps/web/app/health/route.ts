import { getHealth } from "@/lib/serverData";

// Read the node on each call: a health payload with a fixed block and timestamp is a fabricated
// heartbeat, and would keep reporting `ok` while the fork is down.
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(await getHealth());
}
