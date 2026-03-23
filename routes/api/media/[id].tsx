import { define } from "../../../utils.ts";
import { deleteFile } from "../../../lib/s3.ts";

export const handler = define.handlers({
  async DELETE(ctx) {
    if (!ctx.state.householdId) {
      return new Response(null, { status: 401 });
    }

    const id = ctx.params.id;

    const result = await ctx.state.db.query(
      "SELECT key FROM media WHERE id = $1 AND household_id = $2",
      [id, ctx.state.householdId],
    );
    if (result.rows.length === 0) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }

    const key = String(result.rows[0].key);

    await deleteFile(key).catch(() => {});

    await ctx.state.db.query(
      "DELETE FROM media WHERE id = $1 AND household_id = $2",
      [id, ctx.state.householdId],
    );

    return Response.json({ ok: true });
  },
});
