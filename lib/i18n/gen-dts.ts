/**
 * Write sibling `.d.ts` for each `locales/*.mfr` catalog.
 * The Vite plugin also does this on `buildStart`; this is for typecheck
 * without a Vite run.
 */
import { compileCatalog, emitTypeScript } from "./compile.ts";

const localesDir = new URL("../../locales/", import.meta.url);
for await (const entry of Deno.readDir(localesDir)) {
  if (!entry.name.endsWith(".mfr")) continue;
  const file = new URL(entry.name, localesDir);
  const src = await Deno.readTextFile(file);
  const locale = entry.name.replace(/\.mfr$/, "");
  const catalog = compileCatalog(src, locale);
  await Deno.writeTextFile(
    new URL(entry.name + ".d.ts", localesDir),
    emitTypeScript(catalog),
  );
  console.log(`${entry.name}: ${catalog.messages.length} messages`);
}
