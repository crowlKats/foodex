/**
 * Turn a failed API response into something worth showing a user.
 *
 * The JSON endpoints answer with `{ error, fields? }` (see `parseJsonBody` in
 * lib/validation.ts). Islands that only branch on `res.ok` turn any server-side
 * rejection into a dead button, so they should route the failure through here.
 */
export async function apiErrorMessage(
  res: Response,
  fallback = "Something went wrong. Please try again.",
): Promise<string> {
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return fallback;
  }

  if (typeof body !== "object" || body === null) return fallback;
  const { error, fields } = body as {
    error?: unknown;
    fields?: Record<string, string[]>;
  };

  const detail = fields
    ? Object.entries(fields)
      .map(([field, messages]) => `${field}: ${messages.join(", ")}`)
      .join("; ")
    : "";

  const message = typeof error === "string" ? error : fallback;
  return detail ? `${message} (${detail})` : message;
}
