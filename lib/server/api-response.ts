import { NextResponse } from "next/server";
import { RetrievalError } from "@/lib/server/resolve-run";
export async function retrievalResponse(work: () => Promise<unknown>) {
  try { return NextResponse.json(await work(), { headers: { "Cache-Control": "no-store" } }); }
  catch (error) {
    return NextResponse.json({ error: error instanceof RetrievalError ? error.message : "Artifact retrieval failed; check configured roots and source schemas" },
      { status: error instanceof RetrievalError ? error.status : 422 });
  }
}
