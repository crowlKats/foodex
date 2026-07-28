import { handler } from "./$index.ts";

export const handlers = handler({
  GET() {
    return new Response(null, {
      status: 302,
      headers: { Location: "/recipes" },
    });
  },
});
