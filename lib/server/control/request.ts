import type { z } from "zod";

import { ControlError } from "@/lib/server/control/errors";

/** Parse a JSON body against a strict request schema. */
export async function readJsonBody<T extends z.ZodTypeAny>(req: Request, schema: T): Promise<z.infer<T>> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new ControlError("A JSON request body is required.", 400);
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const where = first?.path.join(".") || "body";
    throw new ControlError(`Invalid request (${where}): ${first?.message ?? "unexpected value"}`, 400);
  }
  return parsed.data;
}

/** Parse query parameters against a schema. */
export function readQuery<T extends z.ZodTypeAny>(req: Request, schema: T): z.infer<T> {
  const params = Object.fromEntries(new URL(req.url).searchParams.entries());
  const parsed = schema.safeParse(params);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    throw new ControlError(`Invalid query (${first?.path.join(".") || "query"}): ${first?.message ?? "unexpected value"}`, 400);
  }
  return parsed.data;
}
