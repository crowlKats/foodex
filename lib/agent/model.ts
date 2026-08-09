// Model access. Every model call in the app goes through OpenRouter's beta auto
// router, which classifies each request and routes it to the most-used model
// for that task.
//
// The model is deliberately not configurable: there is one model id, used for
// text and for vision alike. `openrouter/auto-beta` accepts image input, so
// photo turns work without a separate vision model.

import type { LanguageModel, TextPart } from "ai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";

// Derived rather than imported from @ai-sdk/provider-utils, which is only a
// transitive dependency here.
export type ProviderOptions = NonNullable<TextPart["providerOptions"]>;

const MODEL = "openrouter/auto-beta";

function apiKey(): string {
  const key = Deno.env.get("OPENROUTER_API_KEY");
  if (!key) throw new Error("OPENROUTER_API_KEY is not set");
  return key;
}

/** Whether a usable key is configured, so callers can degrade rather than throw. */
export function hasCredentials(): boolean {
  return Boolean(Deno.env.get("OPENROUTER_API_KEY"));
}

export function getModel(): LanguageModel {
  return createOpenRouter({ apiKey: apiKey() })(MODEL);
}

/**
 * A cache breakpoint for the OpenRouter provider.
 *
 * The router picks a different underlying model per request, so whether the
 * explicit breakpoint is honoured varies: Claude models read it directly, and
 * several others (the Gemini family among them) ignore it but apply implicit
 * caching of their own — measured against the auto router, the ~8k-token
 * system+tools prefix still came back as a cache read. Emitting it always is
 * therefore the right call; it is never an error, and often a large saving.
 *
 * To see what a given request actually did, read `cache_read_input_tokens` —
 * the agent loop records it on every assistant_message event.
 */
export function cacheControl(): ProviderOptions {
  return { openrouter: { cacheControl: { type: "ephemeral", ttl: "5m" } } };
}

/**
 * The settled USD cost of a request, from OpenRouter's provider metadata.
 *
 * Returned on every response without needing the `usage.include` flag. Null
 * when absent rather than 0, so "not reported" stays distinguishable from
 * "genuinely free" — worth keeping apart, since the auto router's rate depends
 * on whichever model it picked.
 */
export function costOf(
  providerMetadata: Record<string, unknown> | undefined,
): number | null {
  const usage = (providerMetadata?.openrouter as
    | { usage?: { cost?: unknown } }
    | undefined)?.usage;
  return typeof usage?.cost === "number" ? usage.cost : null;
}
