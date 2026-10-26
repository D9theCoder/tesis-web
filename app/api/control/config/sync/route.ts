import { writeCheckoutConfig } from "@/lib/server/control/config-store";
import { assertControlAllowed } from "@/lib/server/control/guard";
import { controlResponse } from "@/lib/server/control/response";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Copy the web profile over `TESIS_ROOT/config.yaml`.
 * Deliberately explicit: the TUI and any headless invocation read that file.
 */
export async function POST(req: Request) {
  return controlResponse(async () => {
    assertControlAllowed(req);
    const result = await writeCheckoutConfig();
    return { ...result, ok: undefined };
  });
}
