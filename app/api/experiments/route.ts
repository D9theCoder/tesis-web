import { listExperiments } from "@/lib/server/experiments";
import { retrievalResponse } from "@/lib/server/api-response";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET(request: Request) {
  return retrievalResponse(() => listExperiments(new URL(request.url).searchParams));
}
