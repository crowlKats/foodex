import { handler, page } from "./$[token].ts";
import { HttpError } from "fresh/errors";
import type { Collection } from "../../../db/types.ts";
import { Button, ButtonLink } from "../../../components/Button.tsx";
import { householdSetupUrl, loginUrl } from "../../../lib/auth.ts";

/**
 * A share link is normally the recipient's first contact with the app, so both
 * detours it can trigger (signing in, then creating a household) have to lead
 * back here rather than dropping them on a landing page.
 */
function shareJoinPath(token: string): string {
  return `/collections/share/${encodeURIComponent(token)}`;
}

export const handlers = handler({
  async GET(ctx) {
    const token = ctx.params.token;
    const collRes = await ctx.state.db.query<
      Collection & { household_name: string }
    >(
      `SELECT c.*, h.name as household_name
       FROM collections c
       JOIN households h ON h.id = c.household_id
       WHERE c.share_token = $1 AND (c.share_token_expires_at IS NULL OR c.share_token_expires_at > now())`,
      [token],
    );
    if (collRes.rows.length === 0) throw new HttpError(404);
    const collection = collRes.rows[0];

    const loggedIn = !!ctx.state.user;
    const hasHousehold = !!ctx.state.householdId;

    // Check if already shared or owned
    let alreadyHasAccess = false;
    if (ctx.state.householdId) {
      if (collection.household_id === ctx.state.householdId) {
        alreadyHasAccess = true;
      } else {
        const existing = await ctx.state.db.query(
          "SELECT 1 FROM collection_shares WHERE collection_id = $1 AND household_id = $2",
          [collection.id, ctx.state.householdId],
        );
        alreadyHasAccess = existing.rows.length > 0;
      }
    }

    ctx.state.pageTitle = `Join Collection: ${collection.name}`;
    return {
      data: {
        collection,
        loggedIn,
        hasHousehold,
        alreadyHasAccess,
        joinPath: shareJoinPath(token),
      },
    };
  },
  async POST(ctx) {
    const token = ctx.params.token;
    if (!ctx.state.user) {
      return new Response(null, {
        status: 303,
        headers: { Location: loginUrl(shareJoinPath(token)) },
      });
    }
    if (!ctx.state.householdId) {
      return new Response(null, {
        status: 303,
        headers: { Location: householdSetupUrl(shareJoinPath(token)) },
      });
    }

    const collRes = await ctx.state.db.query<Collection>(
      "SELECT * FROM collections WHERE share_token = $1 AND (share_token_expires_at IS NULL OR share_token_expires_at > now())",
      [token],
    );
    if (collRes.rows.length === 0) throw new HttpError(404);
    const collection = collRes.rows[0];

    // Don't share to own household
    if (collection.household_id === ctx.state.householdId) {
      return new Response(null, {
        status: 303,
        headers: { Location: `/collections/${collection.id}` },
      });
    }

    await ctx.state.db.query(
      `INSERT INTO collection_shares (collection_id, household_id, shared_by)
       VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
      [collection.id, ctx.state.householdId, ctx.state.user.id],
    );

    return new Response(null, {
      status: 303,
      headers: { Location: `/collections/${collection.id}` },
    });
  },
});

export default page(
  function ShareJoinPage(
    {
      data: { collection, loggedIn, hasHousehold, alreadyHasAccess, joinPath },
    },
  ) {
    return (
      <div class="max-w-md mx-auto mt-12">
        <div class="card space-y-4 text-center">
          <h1 class="text-2xl font-bold">{collection.name}</h1>
          {collection.description && (
            <p class="text-stone-500">{collection.description}</p>
          )}
          <p class="text-sm text-stone-400">
            Shared by {collection.household_name}
          </p>

          {alreadyHasAccess
            ? (
              <div>
                <p class="text-stone-500 mb-3">
                  You already have access to this collection.
                </p>
                <ButtonLink href={`/collections/${collection.id}`}>
                  View Collection
                </ButtonLink>
              </div>
            )
            : !loggedIn
            ? (
              <ButtonLink href={loginUrl(joinPath)}>
                Sign in to join
              </ButtonLink>
            )
            : !hasHousehold
            ? (
              <ButtonLink href={householdSetupUrl(joinPath)}>
                Create a household first
              </ButtonLink>
            )
            : (
              <form method="POST">
                <Button type="submit">
                  Add to My Collections
                </Button>
              </form>
            )}
        </div>
      </div>
    );
  },
);
