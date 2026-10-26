import { NextResponse } from "next/server";

import { RetrievalError } from "@/lib/server/resolve-run";
import { isControlError } from "@/lib/server/control/errors";

/**
 * JSON envelope for control routes.
 *
 * Mirrors `retrievalResponse` so the client keeps one error convention, and
 * adds the status carried by `ControlError`. Anything unexpected is reported
 * without echoing request data, which may contain credentials.
 */
export async function controlResponse(work: () => Promise<unknown>) {
  try {
    return NextResponse.json(await work(), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (isControlError(error)) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof RetrievalError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json(
      { error: "The runtime control request failed. Check the TESIS checkout and interpreter." },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
