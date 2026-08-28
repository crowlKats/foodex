import { handler } from "./$[...key].ts";
import { mediaIsReadable } from "../../../../lib/media-access.ts";
import { getFile } from "../../../../lib/s3.ts";

export const handlers = handler({
  async GET(ctx) {
    const key = decodeURIComponent(ctx.params.key);

    if (
      !(await mediaIsReadable(ctx.state.db, key, ctx.state.householdId))
    ) {
      return new Response("Not found", { status: 404 });
    }

    const file = await getFile(key);
    if (!file) {
      return new Response("Not found", { status: 404 });
    }

    const SAFE_TYPES = new Set([
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/gif",
      "image/avif",
    ]);
    const contentType = SAFE_TYPES.has(file.contentType)
      ? file.contentType
      : "application/octet-stream";

    return new Response(file.body, {
      headers: {
        "Content-Type": contentType,
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  },
});
