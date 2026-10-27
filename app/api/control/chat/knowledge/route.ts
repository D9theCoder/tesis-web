import { z } from "zod";
import { addLibraryFile, libraryItems, MAX_UPLOAD_BYTES, readLibrary, removeLibraryFile } from "@/lib/server/chat/library";
import { ensureProfile } from "@/lib/server/control/config-store";
import { tesisProcessEnv } from "@/lib/server/control/env";
import { ControlError } from "@/lib/server/control/errors";
import { assertControlAllowed } from "@/lib/server/control/guard";
import { profileConfigPath } from "@/lib/server/control/paths";
import { readJsonBody } from "@/lib/server/control/request";
import { controlResponse } from "@/lib/server/control/response";
import { isSecretKey, tesisRoot } from "@/lib/server/fs-util";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function guard(req: Request) {
  assertControlAllowed(req);
  const origin = req.headers.get("origin");
  if (origin && new URL(origin).host !== req.headers.get("host")) throw new ControlError("Cross-origin chat requests are not allowed.", 403);
}

async function secrets() {
  await ensureProfile();
  const env = await tesisProcessEnv({ TESIS_ROOT: tesisRoot(), TESIS_WEB_CONFIG_PATH: profileConfigPath() });
  return Object.entries(env).filter(([key, value]) => isSecretKey(key) && typeof value === "string" && value.length >= 4).map(([, value]) => value!);
}

async function readForm(req: Request): Promise<FormData> {
  const type = req.headers.get("content-type") ?? "";
  if (!type.startsWith("multipart/form-data;")) throw new ControlError("A file upload is required.", 400);
  const reader = req.body?.getReader();
  if (!reader) throw new ControlError("A file upload is required.", 400);
  const chunks: Uint8Array[] = [];
  let length = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.length;
    if (length > MAX_UPLOAD_BYTES + 65536) { await reader.cancel(); throw new ControlError("The upload exceeds 10 MiB.", 413); }
    chunks.push(value);
  }
  try { return await new Response(new Blob([new Uint8Array(Buffer.concat(chunks))]), { headers: { "Content-Type": type } }).formData(); }
  catch { throw new ControlError("The file upload could not be read.", 400); }
}

export async function GET(req: Request) {
  return controlResponse(async () => { guard(req); return { files: libraryItems(await readLibrary(), await secrets()) }; });
}
export async function POST(req: Request) {
  return controlResponse(async () => {
    guard(req);
    const form = await readForm(req), files = form.getAll("file");
    if (files.length !== 1 || !(files[0] instanceof File) || [...form.keys()].some((key) => key !== "file")) throw new ControlError("Choose exactly one file.", 400);
    return { file: await addLibraryFile(files[0], await secrets()) };
  });
}
export async function DELETE(req: Request) {
  return controlResponse(async () => {
    guard(req);
    const { id } = await readJsonBody(req, z.object({ id: z.string().uuid() }).strict());
    await removeLibraryFile(id);
    return { ok: true };
  });
}
