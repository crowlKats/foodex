import { handler } from "./$index.ts";

// Import folded into the single "New Recipe" entry point; the old URL still
// gets bookmarked and linked to, so it forwards there.
export const handlers = handler({
  GET() {
    return new Response(null, {
      status: 303,
      headers: { Location: "/recipes/new" },
    });
  },
});
