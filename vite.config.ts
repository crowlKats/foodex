import { defineConfig, type Plugin } from "vite";
import { fresh } from "fresh/vite";
import tailwindcss from "@tailwindcss/vite";
import mfr from "./vite-plugin-mfr.ts";

/**
 * Some JSR packages (e.g. `@luca/highlightable-textarea`) publish raw Deno
 * source that imports dependencies with `jsr:`/`npm:` specifiers. Rolldown/Vite
 * can't resolve those, so rewrite them to the plain package names that
 * `deno install` materialized in `node_modules` (`jsr:@a/b` → `@jsr/a__b`).
 */
function denoSpecifiers(): Plugin {
  return {
    name: "deno-specifiers",
    enforce: "pre",
    resolveId(source, importer, options) {
      const npm = source.match(
        /^npm:\/?(@[^/]+\/[^@/]+|[^@/]+)(?:@[^/]+)?(\/.*)?$/,
      );
      const jsr = source.match(/^jsr:\/?@([^/]+)\/([^@/]+)(?:@[^/]+)?(\/.*)?$/);
      let rewritten: string | undefined;
      if (npm) rewritten = npm[1] + (npm[2] ?? "");
      else if (jsr) rewritten = `@jsr/${jsr[1]}__${jsr[2]}` + (jsr[3] ?? "");
      if (!rewritten) return null;
      return this.resolve(rewritten, importer, { ...options, skipSelf: true });
    },
  };
}

export default defineConfig({
  plugins: [denoSpecifiers(), fresh(), tailwindcss(), mfr()],
  server: {
    host: "0.0.0.0",
  },
  // JSR packages ship TypeScript source. Let Vite transpile them for SSR
  // instead of handing raw `.tsx` to the runtime, which can't strip types
  // under node_modules.
  ssr: {
    noExternal: [
      "@luca/highlightable-textarea",
      "@luca/messageformat-resources",
      /@jsr\//,
    ],
  },
});
