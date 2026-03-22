import { define } from "../utils.ts";
import { Nav } from "../components/Nav.tsx";
import PwaInstallPrompt from "../islands/PwaInstallPrompt.tsx";

function DarkModeScript() {
  return (
    <script
      // deno-lint-ignore react-no-danger
      dangerouslySetInnerHTML={{
        __html:
          `(function(){try{var t=localStorage.getItem("theme");if(t==="dark"||(t!=="light"&&matchMedia("(prefers-color-scheme:dark)").matches)){document.documentElement.classList.add("dark")}}catch(e){}})()`,
      }}
    />
  );
}

export default define.page(function App({ Component, state, url }) {
  return (
    <html class="overscroll-none">
      <head>
        <meta charset="utf-8" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1.0, viewport-fit=cover"
        />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta
          name="apple-mobile-web-app-status-bar-style"
          content="black-translucent"
        />
        <meta name="theme-color" content="#1c1917" />
        <link rel="manifest" href="/manifest.json" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <title>
          {state.pageTitle === "Foodex"
            ? "Foodex"
            : `${state.pageTitle} - Foodex`}
        </title>
        <DarkModeScript />
      </head>
      <body class="h-screen flex flex-col overflow-hidden bg-stone-50 dark:bg-stone-950 text-stone-900 dark:text-stone-100">
        <Nav
          user={state.user}
          shoppingListCount={state.shoppingListCount}
          hasHousehold={state.householdId != null}
          currentPath={url.pathname}
        />
        <main class="flex-1 overflow-y-auto overscroll-none pb-[calc(3.5rem+env(safe-area-inset-bottom))] sm:pb-0">
          <div class="max-w-6xl mx-auto px-4 py-6">
            <Component />
          </div>
        </main>
        <PwaInstallPrompt />
      </body>
    </html>
  );
});
