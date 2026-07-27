import "../styles.css";

import { layout } from "./$_layout.ts";
import { Head } from "fresh/runtime";
import { Nav } from "../components/Nav.tsx";
import PwaInstallPrompt from "../islands/PwaInstallPrompt.tsx";

export default layout(function AppLayout({ Component, state, url }) {
  // Full-bleed (no max-width wrapper, no page scroll) for the scanner and the
  // agent chat session — they manage their own full-height layout.
  const fullBleed = url.pathname === "/scan" ||
    /^\/agent\/[^/]+$/.test(url.pathname);
  return (
    <>
      {state.pageTitle !== "Foodex" && (
        <Head>
          <title>{`${state.pageTitle} - Foodex`}</title>
        </Head>
      )}
      <Nav
        user={state.user}
        shoppingListCount={state.shoppingListCount}
        hasHousehold={state.householdId != null}
        currentPath={url.pathname}
      />
      <main
        class={`flex-1 overscroll-none ${
          fullBleed
            ? "overflow-hidden"
            : "overflow-y-auto pb-[calc(3.5rem+env(safe-area-inset-bottom))] sm:pb-0"
        }`}
      >
        {fullBleed ? <Component /> : (
          <div class="max-w-6xl mx-auto px-4 py-6">
            <Component />
          </div>
        )}
      </main>
      <PwaInstallPrompt />
    </>
  );
});
