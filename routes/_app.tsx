import { define } from "../utils.ts";
import { Nav } from "../components/Nav.tsx";

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

export default define.page(function App({ Component, state }) {
  return (
    <html>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>
          {state.pageTitle === "Foodex"
            ? "Foodex"
            : `${state.pageTitle} - Foodex`}
        </title>
        <DarkModeScript />
      </head>
      <body class="min-h-screen bg-stone-50 dark:bg-stone-950 text-stone-900 dark:text-stone-100">
        <Nav
          user={state.user}
          shoppingListCount={state.shoppingListCount}
          hasHousehold={state.householdId != null}
        />
        <main class="max-w-6xl mx-auto px-4 py-6">
          <Component />
        </main>
      </body>
    </html>
  );
});
