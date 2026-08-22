import { handler, page } from "./$welcome.ts";
import { Button } from "../components/Button.tsx";
import { Input } from "../components/Input.tsx";
import { FormField } from "../components/FormField.tsx";
import { sanitizeRedirect } from "../lib/auth.ts";
import WelcomeTour from "../islands/WelcomeTour.tsx";
import { createT } from "../components/Translation.tsx";
import { pickBundle } from "../lib/i18n/locale.ts";
import { t as shared } from "../locales/shared.ts";
import en from "./welcome.en.mfr";
import it from "./welcome.it.mfr";

const t = createT({ en, it });

export const handlers = handler({
  GET(ctx) {
    if (!ctx.state.user) {
      return new Response(null, {
        status: 303,
        headers: { Location: "/auth/login" },
      });
    }
    const redirect = sanitizeRedirect(ctx.url.searchParams.get("redirect"));
    const tour = ctx.url.searchParams.get("tour") === "1";
    if (ctx.state.user.name && !tour) {
      return new Response(null, {
        status: 303,
        headers: { Location: redirect ?? "/" },
      });
    }
    ctx.state.pageTitle = pickBundle(ctx.state.locale, { en, it }).get(
      "welcome.title",
    ).format();
    // The tour needs a name to exist first; without one, fall back to the form.
    return { data: { redirect, tour: tour && ctx.state.user.name != null } };
  },
  async POST(ctx) {
    if (!ctx.state.user) {
      return new Response(null, {
        status: 303,
        headers: { Location: "/auth/login" },
      });
    }
    const form = await ctx.req.formData();
    const name = String(form.get("name") ?? "").trim().slice(0, 100);
    const redirect = sanitizeRedirect(String(form.get("redirect") ?? ""));
    if (!name) {
      return new Response(null, {
        status: 303,
        headers: {
          Location: redirect
            ? `/welcome?redirect=${encodeURIComponent(redirect)}`
            : "/welcome",
        },
      });
    }
    await ctx.state.db.query(
      "UPDATE users SET name = $1 WHERE id = $2",
      [name, ctx.state.user.id],
    );
    // Only brand-new users reach the name form, so follow it with the tour.
    return new Response(null, {
      status: 303,
      headers: {
        Location: redirect
          ? `/welcome?tour=1&redirect=${encodeURIComponent(redirect)}`
          : "/welcome?tour=1",
      },
    });
  },
});

export default page(function WelcomePage({ data }) {
  if (data.tour) {
    return <WelcomeTour target={data.redirect ?? "/"} />;
  }
  const trans = t.use();
  return (
    <div class="max-w-md mx-auto mt-12">
      <h1 class="text-2xl font-bold mb-2">{t("welcome.heading")}</h1>
      <p class="text-stone-600 dark:text-stone-400 mb-6">
        {t("welcome.blurb")}
      </p>
      <form method="POST" class="card space-y-4">
        {data.redirect && (
          <input type="hidden" name="redirect" value={data.redirect} />
        )}
        <FormField label={trans("welcome.nameLabel")}>
          <Input
            type="text"
            name="name"
            required
            maxLength={100}
            autofocus
            class="w-full"
            placeholder={trans("welcome.namePlaceholder")}
          />
        </FormField>
        <Button type="submit" class="w-full">
          {shared("common.continue")}
        </Button>
      </form>
    </div>
  );
});
