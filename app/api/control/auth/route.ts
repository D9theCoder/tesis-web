import { chatGPTAccount } from "@/lib/server/control/config-store";
import { readQuery } from "@/lib/server/control/request";
import { controlResponse } from "@/lib/server/control/response";
import { controlAuthQuery } from "@/lib/control-contract";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** ChatGPT (openai_codex_auth) account status or model catalogue. */
export async function GET(req: Request) {
  return controlResponse(async () => {
    const { action, account } = readQuery(req, controlAuthQuery);
    const result = await chatGPTAccount(action, account);
    return { ...result, ok: undefined };
  });
}
