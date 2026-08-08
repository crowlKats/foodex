import { handler } from "./$guide.ts";

// The old single-page guide now lives at /docs as a multi-page section.
export const handlers = handler({
  GET() {
    return new Response(null, {
      status: 301,
      headers: { Location: "/docs" },
    });
  },
});
