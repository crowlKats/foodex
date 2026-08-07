import { handler, page } from "./$system.ts";
import { AdminNav } from "../../components/AdminNav.tsx";
import { PageHeader } from "../../components/PageHeader.tsx";
import { SectionHeader } from "../../components/SectionHeader.tsx";
import ConfirmButton from "../../islands/ConfirmButton.tsx";
import { captchaEnabled, inviteOnly, providers } from "../../lib/auth.ts";
import { formatBytes } from "../../lib/admin-format.ts";
import { logAudit } from "../../lib/audit.ts";
import { cleanupOrphanedMedia } from "../../db/mod.ts";
import { deleteFile } from "../../lib/s3.ts";

// Presence checks only; the values themselves never reach the page.
const features = {
  anthropic: !!Deno.env.get("ANTHROPIC_API_KEY"),
  s3: !!(Deno.env.get("S3_BUCKET") && Deno.env.get("S3_ACCESS_KEY_ID")),
  email: !!(Deno.env.get("SMTP_HOST") || Deno.env.get("POSTMARK_SERVER_TOKEN")),
  webPush: !!(Deno.env.get("VAPID_PUBLIC_KEY") &&
    Deno.env.get("VAPID_PRIVATE_KEY")),
};

const ORPHAN_MEDIA_WHERE = `
  id NOT IN (
    SELECT cover_image_id FROM recipes WHERE cover_image_id IS NOT NULL
  )
  AND id NOT IN (SELECT media_id FROM recipe_step_media)
  AND id NOT IN (
    SELECT cover_image_id FROM recipe_drafts WHERE cover_image_id IS NOT NULL
  )`;

export const handlers = handler({
  async GET(ctx) {
    const q = ctx.state.db.query;
    const [sessions, media, aiUsage] = await Promise
      .all([
        q<{ active: string; expired: string }>(
          `SELECT
             COUNT(*) FILTER (WHERE expires_at > now()) AS active,
             COUNT(*) FILTER (WHERE expires_at <= now()) AS expired
           FROM sessions`,
        ),
        q<{ cnt: string; bytes: string; orphans: string }>(
          `SELECT COUNT(*) AS cnt, COALESCE(SUM(size_bytes), 0) AS bytes,
             (SELECT COUNT(*) FROM media WHERE ${ORPHAN_MEDIA_WHERE}) AS orphans
           FROM media`,
        ),
        q<{
          model: string;
          calls: string;
          input_tokens: string;
          output_tokens: string;
        }>(
          `SELECT model, COUNT(*) AS calls,
                  SUM(input_tokens) AS input_tokens,
                  SUM(output_tokens) AS output_tokens
           FROM ocr_usage
           WHERE created_at > now() - interval '30 days'
           GROUP BY model ORDER BY calls DESC`,
        ),
      ]);

    ctx.state.pageTitle = "Admin: System";
    return {
      data: {
        sessions: {
          active: Number(sessions.rows[0].active),
          expired: Number(sessions.rows[0].expired),
        },
        media: {
          count: Number(media.rows[0].cnt),
          bytes: Number(media.rows[0].bytes),
          orphans: Number(media.rows[0].orphans),
        },
        aiUsage: aiUsage.rows,
        msg: ctx.url.searchParams.get("msg") || undefined,
      },
    };
  },
  async POST(ctx) {
    const form = await ctx.req.formData();
    const method = String(form.get("_method"));
    let msg = "";

    if (method === "CLEANUP_MEDIA") {
      const removed = await cleanupOrphanedMedia(deleteFile);
      msg = `Removed ${removed} orphaned media file${
        removed === 1 ? "" : "s"
      }.`;
      await logAudit(ctx.state.db.query, ctx.state.adminUser, {
        source: "admin",
        action: "system.media_cleanup",
        targetType: "system",
        targetLabel: "orphaned media",
        detail: `${removed} file${removed === 1 ? "" : "s"} removed`,
      });
    } else if (method === "PURGE_SESSIONS") {
      const purged = await ctx.state.db.query<{ id: string }>(
        "DELETE FROM sessions WHERE expires_at <= now() RETURNING id",
      );
      msg = "Expired sessions purged.";
      await logAudit(ctx.state.db.query, ctx.state.adminUser, {
        source: "admin",
        action: "system.purge_sessions",
        targetType: "system",
        targetLabel: "expired sessions",
        detail: `${purged.rows.length} session${
          purged.rows.length === 1 ? "" : "s"
        } purged`,
      });
    }

    return new Response(null, {
      status: 303,
      headers: {
        Location: `/admin/system${
          msg ? `?msg=${encodeURIComponent(msg)}` : ""
        }`,
      },
    });
  },
});

function FeatureRow({ label, on }: { label: string; on: boolean }) {
  return (
    <div class="flex items-center justify-between text-sm">
      <span>{label}</span>
      <span
        class={`text-xs px-1.5 py-0.5 ${
          on
            ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
            : "bg-stone-200 text-stone-500 dark:bg-stone-700 dark:text-stone-400"
        }`}
      >
        {on ? "configured" : "off"}
      </span>
    </div>
  );
}

export default page(function AdminSystemPage(
  { data: { sessions, media, aiUsage, msg }, url },
) {
  return (
    <div>
      <PageHeader title="System" noSearch />
      <AdminNav currentPath={url.pathname} />

      {msg && <div class="alert-success mb-4">{msg}</div>}

      <div class="grid gap-6 md:grid-cols-2">
        <div class="space-y-6">
          <div class="card">
            <SectionHeader title="Feature configuration" />
            <div class="mt-3 space-y-2">
              <FeatureRow label="Authentik sign-in" on={providers.authentik} />
              <FeatureRow label="GitHub sign-in" on={providers.github} />
              <FeatureRow label="Google sign-in" on={providers.google} />
              <FeatureRow label="Email (magic links)" on={features.email} />
              <FeatureRow label="hCaptcha" on={captchaEnabled} />
              <FeatureRow label="S3 media storage" on={features.s3} />
              <FeatureRow
                label="Anthropic (import & generation)"
                on={features.anthropic}
              />
              <FeatureRow label="Web push" on={features.webPush} />
              <FeatureRow label="Invite-only mode" on={inviteOnly} />
            </div>
          </div>

          <div class="card">
            <SectionHeader title="Sessions" />
            <p class="text-sm text-stone-500 my-3">
              {sessions.active} active, {sessions.expired}{" "}
              expired. Expired rows are also cleaned opportunistically on
              regular traffic.
            </p>
            <form method="POST">
              <input type="hidden" name="_method" value="PURGE_SESSIONS" />
              <ConfirmButton
                message="Delete all expired session rows?"
                variant="outline"
                size="sm"
              >
                Purge expired sessions
              </ConfirmButton>
            </form>
          </div>

          <div class="card">
            <SectionHeader title="Media" />
            <p class="text-sm text-stone-500 my-3">
              {media.count} file{media.count === 1 ? "" : "s"},{" "}
              {formatBytes(media.bytes)} total. {media.orphans}{" "}
              orphaned (not referenced by any recipe, step, or draft).
            </p>
            <form method="POST">
              <input type="hidden" name="_method" value="CLEANUP_MEDIA" />
              <ConfirmButton
                message="Delete all orphaned media rows and their S3 objects?"
                variant="outline"
                size="sm"
              >
                Run media cleanup
              </ConfirmButton>
            </form>
          </div>
        </div>

        <div class="space-y-6">
          <div class="card">
            <SectionHeader title="AI usage, last 30 days" />
            {aiUsage.length === 0
              ? <p class="text-sm text-stone-500 mt-3">No usage recorded.</p>
              : (
                <div class="mt-3 space-y-2">
                  {aiUsage.map((u) => (
                    <div key={u.model} class="text-sm">
                      <div class="font-medium">{u.model}</div>
                      <div class="text-stone-500">
                        {Number(u.calls)}{" "}
                        call{Number(u.calls) === 1 ? "" : "s"},{" "}
                        {Number(u.input_tokens).toLocaleString("en-US")} in /
                        {" "}
                        {Number(u.output_tokens).toLocaleString("en-US")}{" "}
                        out tokens
                      </div>
                    </div>
                  ))}
                </div>
              )}
          </div>
        </div>
      </div>
    </div>
  );
});
