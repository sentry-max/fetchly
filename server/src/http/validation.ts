import type { Context } from "hono";
import type { z } from "zod";
import { ApiError } from "./apiError.js";

export async function parseJsonBody<Schema extends z.ZodType>(
  context: Context,
  schema: Schema,
): Promise<z.infer<Schema>> {
  let body: unknown;
  try {
    body = await context.req.json();
  } catch {
    throw new ApiError("VALIDATION_FAILED", "The request body must be valid JSON.");
  }

  const result = schema.safeParse(body);
  if (!result.success) {
    const fields = result.error.issues.map((issue) => issue.path.join(".") || "body");
    throw new ApiError("VALIDATION_FAILED", undefined, { fields: [...new Set(fields)] });
  }
  return result.data;
}
