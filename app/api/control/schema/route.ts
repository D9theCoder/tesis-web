import { readSchema } from "@/lib/server/control/config-store";
import { activeRun } from "@/lib/server/control/jobs";
import { controlAvailability } from "@/lib/server/control/guard";
import { controlResponse } from "@/lib/server/control/response";
import { controlSchemaResponse } from "@/lib/control-contract";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Settings schema, masked profile document, and the model catalogue.
 * The web renders its forms from this payload so TESIS owns field semantics.
 */
export async function GET() {
  return controlResponse(async () => {
    const schema = await readSchema();
    const active = await activeRun();
    // The bridge already masks literal secrets and scrubs the resolved
    // config; generic redaction here would also rewrite `${VAR}` references
    // inside the YAML document and break the round trip on save.
    return controlSchemaResponse.parse({
      ...schema,
      control: controlAvailability(),
      activeJob: active,
    });
  });
}
