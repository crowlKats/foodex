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

// The one exception to the auto router: transcribing dictation. The router
// advertises audio input, but which model it lands on per request is its
// call, and a text-only pick would fail the whole recording. So dictation
// pins an audio-capable model, with OpenRouter's request-level fallback list
// behind it: if the primary errors, the next one answers. All three take
// audio natively and handle any language; the last is a different vendor so
// a Google outage does not take dictation down with it.
const TRANSCRIPTION_MODELS = [
  "google/gemini-3.8-flash",
  "google/gemini-2.5-flash",
  "openai/gpt-audio-mini",
];

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
 * The audio-capable model used to transcribe dictated recordings.
 *
 * Reasoning is dialled to the minimum: these are thinking models by default,
 * and thinking adds latency and tokens to what is a straight listen-and-write
 * task. "minimal" rather than "none" because every model in the chain
 * accepts it; a rejected parameter would count as an error and skip a model.
 */
export function getTranscriptionModel(): LanguageModel {
  const [primary, ...fallbacks] = TRANSCRIPTION_MODELS;
  return createOpenRouter({ apiKey: apiKey() })(primary, {
    models: fallbacks,
    reasoning: { effort: "minimal", exclude: true },
  });
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
