import { handler, page } from "./$index.ts";
import type { Household } from "../../db/types.ts";
import { Button } from "../../components/Button.tsx";
import { Input } from "../../components/Input.tsx";
import { Select } from "../../components/Select.tsx";
import ConfirmButton from "../../islands/ConfirmButton.tsx";
import CopyButton from "../../islands/CopyButton.tsx";
import {
  type ApiTokenInfo,
  createApiToken,
  listApiTokens,
  revokeApiToken,
} from "../../lib/api-tokens.ts";

interface ProfileData {
  householdName: string | null;
  tokens: ApiTokenInfo[];
  /** A token minted by this request: shown once, never stored in clear. */
  newToken: { name: string; secret: string } | null;
}

async function loadProfile(
  q: Parameters<typeof listApiTokens>[0],
  userId: string,
  householdId: string | null,
): Promise<Omit<ProfileData, "newToken">> {
  let householdName: string | null = null;
  if (householdId) {
    const res = await q<Pick<Household, "name">>(
      "SELECT name FROM households WHERE id = $1",
      [householdId],
    );
    if (res.rows.length > 0) {
      householdName = res.rows[0].name;
    }
  }
  return { householdName, tokens: await listApiTokens(q, userId) };
}

export const handlers = handler({
  async GET(ctx) {
    if (!ctx.state.user) {
      return new Response(null, {
        status: 303,
        headers: { Location: "/auth/login" },
      });
    }

    ctx.state.pageTitle = "Profile";
    const data: ProfileData = {
      ...(await loadProfile(
        ctx.state.db.query,
        ctx.state.user.id,
        ctx.state.householdId,
      )),
      newToken: null,
    };
    return { data };
  },
  async POST(ctx) {
    if (!ctx.state.user) {
      return new Response(null, {
        status: 303,
        headers: { Location: "/auth/login" },
      });
    }

    const form = await ctx.req.formData();
    const action = form.get("action");

    // Minting a token renders the page directly rather than redirecting:
    // the secret is shown exactly once and must not travel through a URL.
    if (action === "create_token") {
      const rawName = form.get("token_name");
      const name = typeof rawName === "string"
        ? rawName.trim().slice(0, 100)
        : "";
      if (!name) {
        return new Response(null, {
          status: 303,
          headers: { Location: "/profile" },
        });
      }
      const { secret } = await createApiToken(
        ctx.state.db.query,
        ctx.state.user.id,
        name,
      );
      ctx.state.pageTitle = "Profile";
      const data: ProfileData = {
        ...(await loadProfile(
          ctx.state.db.query,
          ctx.state.user.id,
          ctx.state.householdId,
        )),
        newToken: { name, secret },
      };
      return { data };
    }

    if (action === "revoke_token") {
      const tokenId = form.get("token_id");
      if (typeof tokenId === "string" && tokenId) {
        await revokeApiToken(ctx.state.db.query, ctx.state.user.id, tokenId);
      }
      return new Response(null, {
        status: 303,
        headers: { Location: "/profile" },
      });
    }

    const unitSystem = form.get("unit_system");

    if (unitSystem === "metric" || unitSystem === "imperial") {
      await ctx.state.db.query(
        "UPDATE users SET unit_system = $1 WHERE id = $2",
        [unitSystem, ctx.state.user.id],
      );
    }

    const name = form.get("name");
    if (typeof name === "string" && name.trim()) {
      await ctx.state.db.query(
        "UPDATE users SET name = $1 WHERE id = $2",
        [name.trim().slice(0, 100), ctx.state.user.id],
      );
    }

    return new Response(null, {
      status: 303,
      headers: { Location: "/profile" },
    });
  },
});

function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default page(
  function ProfilePage({ data, state }) {
    const user = state.user!;

    return (
      <div class="max-w-md mx-auto">
        <div class="flex items-center gap-4 mb-6">
          {user.avatar_url && (
            <img
              src={user.avatar_url}
              alt={user.name ?? ""}
              class="size-16 rounded-full"
            />
          )}
          <div>
            <h1 class="text-2xl font-bold">{user.name}</h1>
            {user.email && <p class="text-sm text-stone-500">{user.email}</p>}
          </div>
        </div>

        <div class="card mb-4">
          <h2 class="text-lg font-semibold mb-3">Display Name</h2>
          <p class="text-xs text-stone-500 mb-3">
            Shown to other members of your household.
          </p>
          <form method="POST" class="flex gap-2">
            <Input
              type="text"
              name="name"
              value={user.name ?? ""}
              required
              maxLength={100}
              class="flex-1 min-w-0"
            />
            <Button type="submit">Save</Button>
          </form>
        </div>

        <div class="card mb-4">
          <h2 class="text-lg font-semibold mb-3">Preferences</h2>
          <form method="POST">
            <label class="text-sm font-medium block mb-1">Unit system</label>
            <div class="flex gap-2">
              <Select name="unit_system" class="flex-1">
                <option value="metric" selected={state.unitSystem === "metric"}>
                  Metric (g, ml, cm)
                </option>
                <option
                  value="imperial"
                  selected={state.unitSystem === "imperial"}
                >
                  Imperial (oz, fl oz, inch)
                </option>
              </Select>
              <Button type="submit">Save</Button>
            </div>
          </form>
        </div>

        {data.householdName && (
          <div class="card mb-4">
            <h2 class="text-lg font-semibold mb-2">Household</h2>
            <a
              href="/household"
              class="link"
            >
              {data.householdName}
            </a>
          </div>
        )}

        <div class="card mb-4">
          <h2 class="text-lg font-semibold mb-1">API tokens</h2>
          <p class="text-xs text-stone-500 mb-3">
            Let an AI assistant such as Claude Code use Foodex as you, over MCP.
            A token can read your household's recipes, pantry, plan and shopping
            list, and add to the plan, the list and the pantry.{" "}
            <a href="/docs/mcp" class="link">How to connect</a>
          </p>

          {data.newToken && (
            <div class="border-2 border-orange-400 p-3 mb-4">
              <p class="text-sm font-medium mb-1">
                Token for "{data.newToken.name}"
              </p>
              <p class="text-xs text-stone-500 mb-2">
                Copy it now. It is shown only this once.
              </p>
              <div class="flex gap-2 items-center">
                <code class="flex-1 min-w-0 text-xs break-all select-all">
                  {data.newToken.secret}
                </code>
                <CopyButton text={data.newToken.secret} size="sm" />
              </div>
            </div>
          )}

          {data.tokens.length > 0 && (
            <ul class="divide-y divide-stone-200 dark:divide-stone-700 mb-3">
              {data.tokens.map((t) => (
                <li key={t.id} class="py-2 flex items-center gap-3">
                  <div class="flex-1 min-w-0">
                    <div class="text-sm font-medium truncate">{t.name}</div>
                    <div class="text-xs text-stone-500 font-mono">
                      {t.prefix}…
                    </div>
                    <div class="text-xs text-stone-500">
                      Created {formatDay(t.created_at)}
                      {t.last_used_at
                        ? `, last used ${formatDay(t.last_used_at)}`
                        : ", never used"}
                    </div>
                  </div>
                  <form method="POST">
                    <input type="hidden" name="action" value="revoke_token" />
                    <input type="hidden" name="token_id" value={t.id} />
                    <ConfirmButton
                      message={`Revoke "${t.name}"? Anything using it stops working.`}
                      variant="danger-outline"
                      size="sm"
                    >
                      Revoke
                    </ConfirmButton>
                  </form>
                </li>
              ))}
            </ul>
          )}

          <form method="POST" class="flex gap-2">
            <input type="hidden" name="action" value="create_token" />
            <Input
              type="text"
              name="token_name"
              placeholder="What is it for? (Claude Code on my laptop)"
              required
              maxLength={100}
              class="flex-1 min-w-0"
            />
            <Button type="submit" variant="outline">Create token</Button>
          </form>
        </div>

        {
          /* Sign out lived only in the desktop header, so on a phone there was
            no way to sign out at all. */
        }
        <form method="POST" action="/auth/logout">
          <Button type="submit" variant="danger-outline" class="w-full">
            Sign out
          </Button>
        </form>
      </div>
    );
  },
);
