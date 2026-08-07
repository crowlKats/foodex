import { handler } from "./$upload.ts";
import { uploadFile } from "../../lib/s3.ts";
import { reduceImage, REDUCIBLE_TYPES } from "../../lib/image-reduce.ts";

export const handlers = handler({
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

    let ext = ALLOWED_TYPES[file.type];
    if (!ext) {
      return Response.json({ error: "File type not allowed" }, { status: 415 });
    }

    let bytes: Uint8Array = new Uint8Array(await file.arrayBuffer());
    let contentType = file.type;
    if (REDUCIBLE_TYPES.has(contentType)) {
      const reduced = await reduceImage(bytes, contentType, ext);
      if (!reduced) {
        return Response.json({ error: "File is not a valid image" }, {
          status: 400,
        });
      }
      ({ bytes, contentType, ext } = reduced);
    }

    const key = `uploads/${crypto.randomUUID()}.${ext}`;
    let url: string;
    try {
      url = await uploadFile(key, bytes, contentType);
    } catch (e) {
      // Surface storage failures as JSON (misconfigured/unreachable S3);
      // an uncaught throw would render the HTML error page instead.
      console.error("upload: storage write failed:", e);
      return Response.json({ error: "Storage upload failed" }, { status: 502 });
    }

    const result = await ctx.state.db.query(
      `INSERT INTO media (key, url, content_type, filename, size_bytes, household_id)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, url, filename`,
      [key, url, contentType, file.name, bytes.length, ctx.state.householdId],
    );

    return Response.json(result.rows[0]);
  },
});
