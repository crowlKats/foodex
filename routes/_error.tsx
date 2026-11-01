import "../styles.css";

import { handler, page } from "./$_error.ts";
import { HttpError } from "fresh/errors";
import { Head } from "fresh/runtime";
import { Nav } from "../components/Nav.tsx";
import { ButtonLink } from "../components/Button.tsx";
import { loadSessionState } from "../lib/session.ts";
import { LocaleProvider } from "../components/Translation.tsx";
import { t } from "../locales/shared.ts";

export const handlers = handler(async (ctx) => ({
  data: await loadSessionState(ctx.req),
}));

/**
 * Without this route a missing recipe rendered as the string "Not Found" in
 * monospace on a bare viewport: no nav, no styling, indistinguishable from a
 * crash. Recipes and shopping lists are both shareable, so stale and mistyped
 * URLs reach real users.
 *
 * Error pages render outside `_layout.tsx`, so the shell is rebuilt here
 * rather than inherited.
 */
export default page(function ErrorPage({ error, url, data }) {
  const status = error instanceof HttpError ? error.status : 500;
  const notFound = status === 404;
  const locale = data.locale;

  return (
    <LocaleProvider locale={locale}>
      <Head>
        <script
          // deno-lint-ignore react-no-danger
          dangerouslySetInnerHTML={{
            __html: `globalThis.__LOCALE__ = ${JSON.stringify(locale)};`,
          }}
        />
        <html lang={locale} />
      </Head>
      <Nav
        user={data.user}
        shoppingListCount={data.shoppingListCount}
        hasHousehold={data.householdId != null}
        isAdmin={data.isAdmin}
        currentPath={url.pathname}
      />
      <main class="flex-1 overflow-y-auto">
        <div class="max-w-md mx-auto px-4 py-16 text-center">
          <p class="text-6xl font-bold text-stone-300 dark:text-stone-700">
            {status}
          </p>
          <h1 class="text-2xl font-bold mt-4">
            {notFound ? t("error.notFoundTitle") : t("error.serverTitle")}
          </h1>
          <p class="text-stone-500 mt-2">
            {notFound ? t("error.notFoundBody") : t("error.serverBody")}
          </p>
          <div class="flex flex-wrap gap-2 justify-center mt-6">
            <ButtonLink href="/recipes">{t("error.browseRecipes")}</ButtonLink>
            <ButtonLink href="/" variant="outline">
              {t("common.home")}
            </ButtonLink>
          </div>
        </div>
      </main>
    </LocaleProvider>
  );
});
