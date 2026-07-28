import { app } from "./$_app.ts";

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

/** Prefetch links on hover/touchstart for browsers without speculation rules. */
function PrefetchScript() {
  return (
    <script
      // deno-lint-ignore react-no-danger
      dangerouslySetInnerHTML={{
        __html:
          `(function(){if(HTMLScriptElement.supports&&HTMLScriptElement.supports("speculationrules"))return;var c={};function p(e){var a=e.target.closest("a[href]");if(!a||a.origin!==location.origin||c[a.href])return;c[a.href]=1;var l=document.createElement("link");l.rel="prefetch";l.href=a.href;document.head.appendChild(l)}document.addEventListener("pointerenter",p,true);document.addEventListener("touchstart",p,{passive:true,capture:true})})()`,
      }}
    />
  );
}

export default app(function App({ children }) {
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
        <meta name="view-transition" content="same-origin" />
        <link rel="icon" href="/favicon.ico" sizes="48x48" />
        <link rel="icon" href="/icon.svg" type="image/svg+xml" />
        <link rel="manifest" href="/manifest.json" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <title>Foodex</title>
        <DarkModeScript />
        <PrefetchScript />
        <script
          type="speculationrules"
          // deno-lint-ignore react-no-danger
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              prerender: [{
                where: {
                  and: [
                    { href_matches: "/*" },
                    { not: { href_matches: "/api/*" } },
                    { not: { href_matches: "/auth/*" } },
                  ],
                },
                eagerness: "moderate",
              }],
            }),
          }}
        />
      </head>
      <body class="h-screen flex flex-col overflow-hidden bg-stone-50 dark:bg-stone-950 text-stone-900 dark:text-stone-100">
        {children}
      </body>
    </html>
  );
});
