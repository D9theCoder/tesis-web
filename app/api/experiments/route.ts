import { listExperiments } from "@/lib/server/experiments";
import { retrievalResponse } from "@/lib/server/api-response";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const fresh = params.get("fresh") === "1";
  params.delete("fresh");
  return retrievalResponse(() => listExperiments(params, { fresh }));
}
