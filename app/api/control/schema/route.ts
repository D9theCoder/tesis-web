import { controlResponse } from "@/lib/server/control/response";
import { loadControlSchema } from "@/lib/server/control/schema";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Settings schema, masked profile document, and the model catalogue.
 * The web renders its forms from this payload so TESIS owns field semantics.
 *
 * The bridge already masks literal secrets and scrubs the resolved config;
 * generic redaction here would also rewrite `${VAR}` references inside the YAML
 * document and break the round trip on save.
 */
export async function GET() {
  return controlResponse(() => loadControlSchema());
}
