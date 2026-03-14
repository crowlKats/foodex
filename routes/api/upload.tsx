import { define } from "../../utils.ts";
import { uploadFile } from "../../lib/s3.ts";

export const handler = define.handlers({
  async POST(ctx) {
    const form = await ctx.req.formData();
    const file = form.get("file") as File | null;
    if (!file) {
      return Response.json({ error: "No file provided" }, { status: 400 });
    }

    const ext = file.name.split(".").pop()?.toLowerCase() ?? "bin";
    const key = `uploads/${crypto.randomUUID()}.${ext}`;
    const bytes = new Uint8Array(await file.arrayBuffer());
    const url = await uploadFile(key, bytes, file.type);

    const result = await ctx.state.db.query(
      `INSERT INTO media (key, url, content_type, filename, size_bytes)
       VALUES ($1, $2, $3, $4, $5) RETURNING id, url, filename`,
      [key, url, file.type, file.name, bytes.length],
    );

    return Response.json(result.rows[0]);
  },
});
