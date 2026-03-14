import { define } from "../../../../utils.ts";
import { getFile } from "../../../../lib/s3.ts";

export const handler = define.handlers({
  async GET(ctx) {
    const key = decodeURIComponent(ctx.params.key);

    const file = await getFile(key);
    if (!file) {
      return new Response("Not found", { status: 404 });
    }

    return new Response(file.body, {
      headers: {
        "Content-Type": file.contentType,
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  },
});
