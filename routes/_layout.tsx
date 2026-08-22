import "../styles.css";

import { layout } from "./$_layout.ts";
import { Head } from "fresh/runtime";
import { Nav } from "../components/Nav.tsx";
import PwaInstallPrompt from "../islands/PwaInstallPrompt.tsx";
import { createT, LocaleProvider } from "../components/Translation.tsx";
import en from "./_layout.en.mfr";
import it from "./_layout.it.mfr";

const t = createT({ en, it });

export default layout(function AppLayout({ Component, state, url }) {
  // Full-bleed (no max-width wrapper, no page scroll) for the scanner and the
  // agent chat session; they manage their own full-height layout.
  const agentSession = /^\/agent\/[^/]+$/.test(url.pathname);
  const fullBleed = url.pathname === "/scan" || agentSession;
  // Fixed mobile tab bar in Nav. Regular pages pad main so content can scroll
  // above it. The agent session is overflow-hidden, so it needs the same inset
  // or the composer (and drawer footers) sit under the tabs. Scan measures the
  // bar itself and must not get a second inset.
  const mobileNavInset =
    "pb-[calc(3.5rem+env(safe-area-inset-bottom))] lg:pb-0";
  // The welcome walkthrough points at nav items, so it needs the full menu
  // even though the new user has no household yet. The links just bounce to
  // household setup, which is where the tour sends them anyway.
  const navPreview = url.pathname === "/welcome" &&
    url.searchParams.get("tour") === "1";
  return (
    <LocaleProvider locale={state.locale}>
      {state.pageTitle !== "Foodex" && (
        <Head>
          <title>{`${state.pageTitle} - Foodex`}</title>
        </Head>
      )}
      <Head>
        <script
          // deno-lint-ignore react-no-danger
          dangerouslySetInnerHTML={{
            __html: `globalThis.__LOCALE__ = ${JSON.stringify(state.locale)};`,
          }}
        />
        <html lang={state.locale} />
      </Head>
      <Nav
        user={state.user}
        shoppingListCount={state.shoppingListCount}
        hasHousehold={state.householdId != null || navPreview}
        isAdmin={state.isAdmin}
        currentPath={url.pathname}
      />
      {state.user?.sudoBy && (
        <div class="bg-red-600 text-white text-sm px-4 py-1.5 flex items-center gap-3">
          <span class="flex-1">
            {t("sudo.banner", {
              name: state.user.name ?? "",
              admin: state.user.sudoBy.name ?? "",
            })}
          </span>
          <form method="POST" action="/admin/sudo">
            <input type="hidden" name="_method" value="EXIT" />
            <button
              type="submit"
              class="underline font-semibold cursor-pointer whitespace-nowrap"
            >
              {t("sudo.exit")}
            </button>
          </form>
        </div>
      )}
      {
        /*
        Vertical only: `overscroll-none` also sets overscroll-behavior-x, and
        suppressing horizontal overscroll is what cancels the browser's
        swipe-back gesture. Nothing here scrolls sideways, so the x-axis has
        no reason to be locked.
      */
      }
      <main
        class={[
          "flex-1 overscroll-y-none",
          fullBleed ? "overflow-hidden" : `overflow-y-auto ${mobileNavInset}`,
          agentSession ? `flex flex-col ${mobileNavInset}` : "",
        ].filter(Boolean).join(" ")}
      >
        {fullBleed ? <Component /> : (
          <div class="max-w-6xl mx-auto px-4 py-6">
            <Component />
          </div>
        )}
      </main>
      <PwaInstallPrompt />
    </LocaleProvider>
  );
});
