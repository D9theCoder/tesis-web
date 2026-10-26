import { chatGPTAccount } from "@/lib/server/control/config-store";
import { cancelAuthFlow, getAuthFlow, startAuthFlow } from "@/lib/server/control/auth-flow";
import { assertControlAllowed } from "@/lib/server/control/guard";
import { readJsonBody, readQuery } from "@/lib/server/control/request";
import { controlResponse } from "@/lib/server/control/response";
import { controlAuthActionRequest, controlAuthQuery } from "@/lib/control-contract";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * ChatGPT (openai_codex_auth) account status, model catalogue, or the state of
 * the supervised sign-in/sign-out flow. Reads never touch credentials.
 */
export async function GET(req: Request) {
  return controlResponse(async () => {
    const { action, account } = readQuery(req, controlAuthQuery);
    if (action === "flow") return { flow: await getAuthFlow() };
    const result = await chatGPTAccount(action, account);
    return { ...result, ok: undefined };
  });
}

/**
 * Start or cancel a ChatGPT account action.
 *
 * Sign-in starts the same browser-loopback process the TUI uses; the response
 * carries the one-time authorization URL once the runtime has bound its
 * listener. Sign-out always clears local tokens and reports whether OpenAI
 * confirmed the remote revocation.
 */
export async function POST(req: Request) {
  return controlResponse(async () => {
    assertControlAllowed(req);
    const body = await readJsonBody(req, controlAuthActionRequest);
    const flow =
      body.action === "cancel"
        ? await cancelAuthFlow(body.account)
        : await startAuthFlow(body.action, body.account);
    return { flow };
  });
}
