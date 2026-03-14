import { define } from "../../utils.ts";
import { extractRecipeFromImages } from "../../lib/ocr.ts";

export const handler = define.handlers({
  async POST(ctx) {
    const form = await ctx.req.formData();
    const files = form.getAll("image") as File[];
    const validFiles = files.filter((f) => f.size > 0);
    const context = (form.get("context") as string) || "";

    if (validFiles.length === 0) {
      return new Response(JSON.stringify({ error: "No images provided" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    try {
      const images = await Promise.all(
        validFiles.map(async (f) => ({
          bytes: new Uint8Array(await f.arrayBuffer()),
          contentType: f.type,
        })),
      );
      const ocr = await extractRecipeFromImages(images, context);
      return new Response(JSON.stringify(ocr), {
        headers: { "Content-Type": "application/json" },
      });
    } catch (err) {
      return new Response(
        JSON.stringify({ error: (err as Error).message }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }
  },
});
