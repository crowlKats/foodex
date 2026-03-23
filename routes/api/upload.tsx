import { define } from "../../utils.ts";
import { uploadFile } from "../../lib/s3.ts";

export const handler = define.handlers({
  async POST(ctx) {
    if (!ctx.state.householdId) {
      return new Response(null, { status: 401 });
    }

    const ALLOWED_TYPES: Record<string, string> = {
      "image/jpeg": "jpg",
      "image/png": "png",
      "image/webp": "webp",
      "image/gif": "gif",
      "image/avif": "avif",
    };
    const MAX_SIZE = 10 * 1024 * 1024; // 10 MB

    const form = await ctx.req.formData();
    const file = form.get("file") as File | null;
    if (!file) {
      return Response.json({ error: "No file provided" }, { status: 400 });
    }

    if (file.size > MAX_SIZE) {
      return Response.json({ error: "File too large (max 10 MB)" }, {
        status: 413,
      });
    }

    const ext = ALLOWED_TYPES[file.type];
    if (!ext) {
      return Response.json({ error: "File type not allowed" }, { status: 415 });
    }

    const key = `uploads/${crypto.randomUUID()}.${ext}`;
    const bytes = new Uint8Array(await file.arrayBuffer());
    const url = await uploadFile(key, bytes, file.type);

    const result = await ctx.state.db.query(
      `INSERT INTO media (key, url, content_type, filename, size_bytes, household_id)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, url, filename`,
      [key, url, file.type, file.name, bytes.length, ctx.state.householdId],
    );

    return Response.json(result.rows[0]);
  },
});
