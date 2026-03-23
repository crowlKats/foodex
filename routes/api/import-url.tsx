import { define } from "../../utils.ts";
import { importRecipeFromUrl } from "../../lib/url-import.ts";
import { ImportUrlBody, parseJsonBody } from "../../lib/validation.ts";

export const handler = define.handlers({
  async POST(ctx) {
    if (!ctx.state.user || !ctx.state.householdId) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const result = await parseJsonBody(ctx.req, ImportUrlBody);
    if (!result.success) return result.response;
    const body = result.data;

    const parsed = new URL(body.url);

    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return new Response(
        JSON.stringify({ error: "Only HTTP(S) URLs are allowed" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    const hostname = parsed.hostname;
    // Block private/internal IPs and metadata endpoints
    if (
      hostname === "localhost" ||
      hostname.endsWith(".local") ||
      hostname.endsWith(".internal") ||
      /^127\./.test(hostname) ||
      /^10\./.test(hostname) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(hostname) ||
      /^192\.168\./.test(hostname) ||
      hostname === "169.254.169.254" ||
      /^169\.254\./.test(hostname) ||
      hostname === "[::1]" ||
      hostname === "0.0.0.0" ||
      /^\[?fd[0-9a-f]{2}:/.test(hostname) ||
      /^\[?fe80:/.test(hostname)
    ) {
      return new Response(JSON.stringify({ error: "URL not allowed" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    try {
      const recipe = await importRecipeFromUrl(body.url);
      return new Response(JSON.stringify(recipe), {
        headers: { "Content-Type": "application/json" },
      });
    } catch (err) {
      console.error("URL import error:", err);
      return new Response(
        JSON.stringify({ error: "Failed to import recipe from URL" }),
        {
          status: 422,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
  },
});
