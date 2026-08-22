import { handler, page } from "./$index.ts";
import { PageHeader } from "../../components/PageHeader.tsx";
import { FormField } from "../../components/FormField.tsx";
import { Button } from "../../components/Button.tsx";
import { Input } from "../../components/Input.tsx";
import type { Household, HouseholdInvite } from "../../db/types.ts";
import { logAudit } from "../../lib/audit.ts";
import { inviteOnly, loginUrl, sanitizeRedirect } from "../../lib/auth.ts";
import { unpackMovingBox } from "../../lib/moving-box.ts";
import { createT } from "../../components/Translation.tsx";
import { pickBundle } from "../../lib/i18n/locale.ts";
import { t as shared } from "../../locales/shared.ts";
import en from "./index.en.mfr";
import it from "./index.it.mfr";

const t = createT({ en, it });

export const handlers = handler({
  async GET(ctx) {
    const redirectTo = sanitizeRedirect(ctx.url.searchParams.get("redirect"));

    if (!ctx.state.user) {
      return new Response(null, {
        status: 303,
        headers: { Location: loginUrl(ctx.url.pathname + ctx.url.search) },
      });
    }

    // If user already belongs to a household, redirect to it
    const result = await ctx.state.db.query<Pick<Household, "id">>(
      `SELECT h.id FROM households h
       JOIN household_members hm ON hm.household_id = h.id AND hm.user_id = $1`,
      [ctx.state.user.id],
    );

    if (result.rows.length > 0) {
      return new Response(null, {
        status: 303,
        headers: { Location: redirectTo ?? `/household` },
      });
    }

    ctx.state.pageTitle = pickBundle(ctx.state.locale, { en, it }).get(
      "household.joinOrCreateTitle",
    ).format();
    const boxRes = await ctx.state.db.query<{ cnt: string }>(
      "SELECT COUNT(*) as cnt FROM moving_box_recipes WHERE user_id = $1",
      [ctx.state.user.id],
    );
    return {
      data: { redirectTo, inviteOnly, boxCount: Number(boxRes.rows[0].cnt) },
    };
  },
  async POST(ctx) {
    if (!ctx.state.user) {
      return new Response(null, {
        status: 303,
        headers: { Location: loginUrl(ctx.url.pathname + ctx.url.search) },
      });
    }

    const form = await ctx.req.formData();
    const rawRedirect = form.get("redirect");
    // Onboarding is a detour: hand the user back to whatever sent them here.
    const redirectTo = sanitizeRedirect(
      typeof rawRedirect === "string" ? rawRedirect : null,
    );
    const done = redirectTo ?? "/household";

    // If user already belongs to a household, redirect to it
    const existing = await ctx.state.db.query<Pick<Household, "id">>(
      `SELECT h.id FROM households h
       JOIN household_members hm ON hm.household_id = h.id AND hm.user_id = $1`,
      [ctx.state.user.id],
    );
    if (existing.rows.length > 0) {
      return new Response(null, {
        status: 303,
        headers: { Location: done },
      });
    }

    const method = form.get("_method");

    if (method === "JOIN") {
      const code = (form.get("code") as string)?.trim();
      if (!code) {
        return {
          data: {
            error: pickBundle(ctx.state.locale, { en, it }).get(
              "household.inviteCodeRequired",
            ).format(),
            redirectTo,
            inviteOnly,
          },
        };
      }

      const inviteRes = await ctx.state.db.query<
        Pick<HouseholdInvite, "household_id" | "grants_owner"> & {
          household_name: string;
        }
      >(
        `SELECT hi.household_id, hi.grants_owner, h.name as household_name
         FROM household_invites hi
         JOIN households h ON h.id = hi.household_id
         WHERE hi.code = $1 AND hi.expires_at > now()`,
        [code],
      );
      if (inviteRes.rows.length === 0) {
        return {
          data: {
            error: pickBundle(ctx.state.locale, { en, it }).get(
              "household.invalidInvite",
            ).format(),
            redirectTo,
            inviteOnly,
          },
        };
      }

      const householdId = inviteRes.rows[0].household_id;
      await ctx.state.db.query(
        "INSERT INTO household_members (household_id, user_id, role) VALUES ($1, $2, $3)",
        [
          householdId,
          ctx.state.user.id,
          inviteRes.rows[0].grants_owner ? "owner" : "member",
        ],
      );

      await logAudit(ctx.state.db.query, ctx.state.user, {
        action: "household.join",
        targetType: "household",
        targetId: householdId,
        targetLabel: inviteRes.rows[0].household_name,
        householdId,
      });

      await unpackMovingBox(ctx.state.db.query, ctx.state.user, householdId)
        .catch((err) => console.error("moving box unpack failed:", err));

      return new Response(null, {
        status: 303,
        headers: { Location: done },
      });
    }

    if (inviteOnly) {
      return {
        data: {
          error: pickBundle(ctx.state.locale, { en, it }).get(
            "household.inviteOnlyCreate",
          ).format(),
          redirectTo,
          inviteOnly,
        },
      };
    }

    const name = form.get("name") as string;

    if (!name?.trim()) {
      return {
        data: {
          error: pickBundle(ctx.state.locale, { en, it }).get(
            "household.nameRequired",
          ).format(),
          redirectTo,
          inviteOnly,
        },
      };
    }

    const houseRes = await ctx.state.db.query<Pick<Household, "id">>(
      "INSERT INTO households (name, created_by) VALUES ($1, $2) RETURNING id",
      [name.trim(), ctx.state.user.id],
    );
    const householdId = houseRes.rows[0].id;

    await ctx.state.db.query(
      "INSERT INTO household_members (household_id, user_id, role) VALUES ($1, $2, 'owner')",
      [householdId, ctx.state.user.id],
    );

    await logAudit(ctx.state.db.query, ctx.state.user, {
      action: "household.create",
      targetType: "household",
      targetId: householdId,
      targetLabel: name.trim(),
      householdId,
    });

    await unpackMovingBox(ctx.state.db.query, ctx.state.user, householdId)
      .catch((err) => console.error("moving box unpack failed:", err));

    return new Response(null, {
      status: 303,
      headers: { Location: done },
    });
  },
});

export default page(function HouseholdsPage({ data }) {
  const { error, redirectTo, inviteOnly: invitesOnly, boxCount } = data as {
    error?: string;
    redirectTo?: string | null;
    inviteOnly?: boolean;
    boxCount?: number;
  };
  const trans = t.use();
  const sharedTrans = shared.use();
  const carryRedirect = redirectTo
    ? <input type="hidden" name="redirect" value={redirectTo} />
    : null;

  return (
    <div class="max-w-md mx-auto mt-12">
      <PageHeader title={trans("household.getStarted")} noSearch />

      <p class="text-stone-500 mb-6">
        {invitesOnly
          ? t("household.getStartedInviteOnly")
          : t("household.getStartedBlurb")}
      </p>

      {error && (
        <div class="alert-error mb-4">
          {error}
        </div>
      )}

      {(boxCount ?? 0) > 0 && (
        <div class="alert-success mb-4">
          {t("household.boxWillUnpack", { count: boxCount ?? 0 })}
        </div>
      )}

      <div class="space-y-6">
        {!invitesOnly && (
          <>
            <div>
              <h2 class="text-lg font-semibold mb-3">
                {t("household.createHousehold")}
              </h2>
              <form method="POST" class="card space-y-3">
                {carryRedirect}
                <FormField label={sharedTrans("common.name")}>
                  <Input
                    type="text"
                    name="name"
                    required
                    placeholder={trans("household.namePlaceholder")}
                    class="w-full"
                  />
                </FormField>
                <Button type="submit">
                  {t("household.createHousehold")}
                </Button>
              </form>
            </div>

            <div class="flex items-center gap-4">
              <hr class="flex-1 border-stone-300 dark:border-stone-700" />
              <span class="text-sm text-stone-400">{shared("common.or")}</span>
              <hr class="flex-1 border-stone-300 dark:border-stone-700" />
            </div>
          </>
        )}

        <div>
          <h2 class="text-lg font-semibold mb-3">
            {t("household.joinHousehold")}
          </h2>
          <form method="POST" class="card space-y-3">
            <input type="hidden" name="_method" value="JOIN" />
            {carryRedirect}
            <FormField label={trans("household.inviteCode")}>
              <Input
                type="text"
                name="code"
                required
                placeholder={trans("household.inviteCodePlaceholder")}
                class="w-full"
              />
            </FormField>
            <Button type="submit">
              {t("household.joinHousehold")}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
});
