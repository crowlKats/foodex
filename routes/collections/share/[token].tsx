import { HttpError, page } from "fresh";
import { define } from "../../../utils.ts";
import type { Collection } from "../../../db/types.ts";

export const handler = define.handlers({
  async GET(ctx) {
    const token = ctx.params.token;
    const collRes = await ctx.state.db.query<
      Collection & { household_name: string }
    >(
      `SELECT c.*, h.name as household_name
       FROM collections c
       JOIN households h ON h.id = c.household_id
       WHERE c.share_token = $1`,
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
    return page({ collection, loggedIn, hasHousehold, alreadyHasAccess });
  },
  async POST(ctx) {
    const token = ctx.params.token;
    if (!ctx.state.user || !ctx.state.householdId) {
      return new Response(null, {
        status: 303,
        headers: { Location: "/auth/login" },
      });
    }

    const collRes = await ctx.state.db.query<Collection>(
      "SELECT * FROM collections WHERE share_token = $1",
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

export default define.page<typeof handler>(
  function ShareJoinPage(
    { data: { collection, loggedIn, hasHousehold, alreadyHasAccess } },
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
                <a
                  href={`/collections/${collection.id}`}
                  class="btn btn-primary"
                >
                  View Collection
                </a>
              </div>
            )
            : !loggedIn
            ? (
              <a href="/auth/login" class="btn btn-primary">
                Sign in to join
              </a>
            )
            : !hasHousehold
            ? (
              <a href="/households" class="btn btn-primary">
                Create a household first
              </a>
            )
            : (
              <form method="POST">
                <button type="submit" class="btn btn-primary">
                  Add to My Collections
                </button>
              </form>
            )}
        </div>
      </div>
    );
  },
);
