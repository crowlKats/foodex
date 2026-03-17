import { define } from "../../../utils.ts";
import { deleteFile } from "../../../lib/s3.ts";

export const handler = define.handlers({
  async DELETE(ctx) {
    const id = parseInt(ctx.params.id);

    const result = await ctx.state.db.query(
      "SELECT key FROM media WHERE id = $1",
      [id],
    );
    if (result.rows.length === 0) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }

    const key = String(result.rows[0].key);

    await deleteFile(key).catch(() => {});

    await ctx.state.db.query("DELETE FROM media WHERE id = $1", [id]);

    return Response.json({ ok: true });
  },
});
