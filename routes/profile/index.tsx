import { handler, page } from "./$index.ts";
import type { Household } from "../../db/types.ts";
import { Button } from "../../components/Button.tsx";
import { Input } from "../../components/Input.tsx";
import { Select } from "../../components/Select.tsx";
import { createT } from "../../components/Translation.tsx";
import {
  isLocale,
  pickBundle,
  SUPPORTED_LOCALES,
} from "../../lib/i18n/locale.ts";
import { t as shared } from "../../locales/shared.ts";
import en from "./index.en.mfr";
import it from "./index.it.mfr";

const t = createT({ en, it });

export const handlers = handler({
  async GET(ctx) {
    if (!ctx.state.user) {
      return new Response(null, {
        status: 303,
        headers: { Location: "/auth/login" },
      });
    }

    let householdName: string | null = null;
    if (ctx.state.householdId) {
      const res = await ctx.state.db.query<Pick<Household, "name">>(
        "SELECT name FROM households WHERE id = $1",
        [ctx.state.householdId],
      );
      if (res.rows.length > 0) {
        householdName = res.rows[0].name;
      }
    }

    ctx.state.pageTitle = pickBundle(ctx.state.locale, { en, it }).get(
      "profile.title",
    ).format();
    return { data: { householdName } };
  },
  async POST(ctx) {
    if (!ctx.state.user) {
      return new Response(null, {
        status: 303,
        headers: { Location: "/auth/login" },
      });
    }

    const form = await ctx.req.formData();
    const unitSystem = form.get("unit_system");

    if (unitSystem === "metric" || unitSystem === "imperial") {
      await ctx.state.db.query(
        "UPDATE users SET unit_system = $1 WHERE id = $2",
        [unitSystem, ctx.state.user.id],
      );
    }

    const language = form.get("language");
    if (typeof language === "string" && isLocale(language)) {
      await ctx.state.db.query(
        "UPDATE users SET language = $1 WHERE id = $2",
        [language, ctx.state.user.id],
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

export default page(
  function ProfilePage({ data, state }) {
    const user = state.user!;
    const trans = t.use();
    const sharedTrans = shared.use();

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
          <h2 class="text-lg font-semibold mb-3">{t("profile.displayName")}</h2>
          <p class="text-xs text-stone-500 mb-3">
            {t("profile.displayNameHelp")}
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
            <Button type="submit">{shared("common.save")}</Button>
          </form>
        </div>

        <div class="card mb-4">
          <h2 class="text-lg font-semibold mb-3">{t("profile.preferences")}</h2>
          <form method="POST" class="space-y-4">
            <div>
              <label class="text-sm font-medium block mb-1">
                {t("profile.unitSystem")}
              </label>
              <Select name="unit_system" class="w-full">
                <option
                  value="metric"
                  selected={state.unitSystem === "metric"}
                >
                  {trans("profile.metric")}
                </option>
                <option
                  value="imperial"
                  selected={state.unitSystem === "imperial"}
                >
                  {trans("profile.imperial")}
                </option>
              </Select>
            </div>
            <div>
              <label class="text-sm font-medium block mb-1">
                {t("profile.language")}
              </label>
              <p class="text-xs text-stone-500 mb-2">
                {t("profile.languageHelp")}
              </p>
              <Select name="language" class="w-full">
                {SUPPORTED_LOCALES.map((loc) => (
                  <option
                    key={loc}
                    value={loc}
                    selected={state.locale === loc}
                  >
                    {sharedTrans(`language.${loc}`)}
                  </option>
                ))}
              </Select>
            </div>
            <Button type="submit">{shared("common.save")}</Button>
          </form>
        </div>

        {data.householdName && (
          <div class="card mb-4">
            <h2 class="text-lg font-semibold mb-2">
              {shared("profile.household")}
            </h2>
            <a
              href="/household"
              class="link"
            >
              {data.householdName}
            </a>
          </div>
        )}

        {
          /* Sign out lived only in the desktop header, so on a phone there was
            no way to sign out at all. */
        }
        <form method="POST" action="/auth/logout">
          <Button type="submit" variant="danger-outline" class="w-full">
            {t("profile.signOut")}
          </Button>
        </form>
      </div>
    );
  },
);
