/**
 * Vite plugin: `.mfr` files (Unicode MessageFormat 2 resources) import as
 * typed JS modules.
 *
 * There is no published first-party Vite plugin for `.mfr` (the only `@luca`
 * MF2 package is `messageformat-resources`, which parses). This plugin is
 * the importer: parse + flatten at build time, emit a module that formats
 * with `messageformat`'s MF2 `MessageFormat` class, and write a sibling
 * `.d.ts` so TypeScript sees the keys.
 */

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";
import { compileCatalog, emitJavaScript, emitTypeScript } from "./compile.ts";

function mfrPath(id: string): string | null {
  const file = id.split("?")[0];
  return file.endsWith(".mfr") ? file : null;
}

function localeFromPath(file: string): string {
  const base = file.replace(/\\/g, "/").split("/").pop() ?? "en.mfr";
  return base.replace(/\.mfr$/, "") || "en";
}

function writeDts(file: string, source: string): void {
  const catalog = compileCatalog(source, localeFromPath(file));
  writeFileSync(file + ".d.ts", emitTypeScript(catalog));
}

export function messageformatResources(): Plugin {
  return {
    name: "vite-plugin-mfr",
    enforce: "pre",
    buildStart() {
      const localesDir = join(
        dirname(fileURLToPath(import.meta.url)),
        "../../locales",
      );
      for (const name of readdirSync(localesDir)) {
        if (!name.endsWith(".mfr")) continue;
        const file = join(localesDir, name);
        writeDts(file, readFileSync(file, "utf8"));
      }
    },
    // `load` (not `transform`) so Vite does not treat unknown `.mfr` as assets.
    load(id) {
      const file = mfrPath(id);
      if (!file) return null;
      const source = readFileSync(file, "utf8");
      const catalog = compileCatalog(source, localeFromPath(file));
      writeDts(file, source);
      return emitJavaScript(catalog);
    },
  };
}
