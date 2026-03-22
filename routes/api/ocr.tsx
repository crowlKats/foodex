import { define } from "../../utils.ts";
import { extractRecipeFromImages } from "../../lib/ocr.ts";

export const handler = define.handlers({
  async POST(ctx) {
    if (!ctx.state.user) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

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
      const { recipe, usage } = await extractRecipeFromImages(images, context);

      await ctx.state.db.query(
        `INSERT INTO ocr_usage (user_id, input_tokens, output_tokens, model)
         VALUES ($1, $2, $3, $4)`,
        [
          ctx.state.user.id,
          usage.input_tokens,
          usage.output_tokens,
          usage.model,
        ],
      );

      return new Response(JSON.stringify(recipe), {
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
