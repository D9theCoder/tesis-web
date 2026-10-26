import { assertControlAllowed } from "@/lib/server/control/guard";
import { startJob } from "@/lib/server/control/jobs";
import { readJsonBody } from "@/lib/server/control/request";
import { controlResponse } from "@/lib/server/control/response";
import { redact } from "@/lib/server/fs-util";
import { controlDoctorRequest } from "@/lib/control-contract";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Run the Doctor against the web profile.
 * Offline checks are local; `live` contacts DVWA and the model providers, so
 * the UI must confirm first — matching the TUI's two-step live action.
 */
export async function POST(req: Request) {
  return controlResponse(async () => {
    assertControlAllowed(req);
    const body = await readJsonBody(req, controlDoctorRequest);
    const job = await startJob("doctor", body.live ? "doctor-live" : "doctor-offline");
    return redact({ job });
  });
}
