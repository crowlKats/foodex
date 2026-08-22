import "../styles.css";

import { handler, page } from "./$_error.ts";
import { HttpError } from "fresh/errors";
import { Nav } from "../components/Nav.tsx";
import { ButtonLink } from "../components/Button.tsx";
import { loadSessionState } from "../lib/session.ts";
import { I18nProvider } from "../lib/i18n/provider.tsx";
import { catalogFor } from "../lib/i18n/mod.ts";

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
  const m = catalogFor(locale);

  return (
    <I18nProvider locale={locale}>
      <Nav
        user={data.user}
        shoppingListCount={data.shoppingListCount}
        hasHousehold={data.householdId != null}
        isAdmin={data.isAdmin}
        currentPath={url.pathname}
        locale={locale}
      />
      <main class="flex-1 overflow-y-auto">
        <div class="max-w-md mx-auto px-4 py-16 text-center">
          <p class="text-6xl font-bold text-stone-300 dark:text-stone-700">
            {status}
          </p>
          <h1 class="text-2xl font-bold mt-4">
            {notFound ? m.error.notFoundTitle() : m.error.serverTitle()}
          </h1>
          <p class="text-stone-500 mt-2">
            {notFound ? m.error.notFoundBody() : m.error.serverBody()}
          </p>
          <div class="flex flex-wrap gap-2 justify-center mt-6">
            <ButtonLink href="/recipes">{m.error.browseRecipes()}</ButtonLink>
            <ButtonLink href="/" variant="outline">
              {m.common.home()}
            </ButtonLink>
          </div>
        </div>
      </main>
    </I18nProvider>
  );
});
