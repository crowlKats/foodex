import { assertEquals } from "@std/assert";
import { MessageFormat } from "messageformat";
import {
  compileCatalog,
  emitJavaScript,
  emitTypeScript,
  extractParams,
} from "./compile.ts";
import {
  matchSupported,
  negotiateLocale,
  parseAcceptLanguage,
} from "./locale.ts";

/** MF2 wraps interpolations in bidi isolates (U+2068/U+2069). */
function visible(s: string): string {
  return s.replace(/[\u2066-\u2069]/g, "");
}

const FIXTURE = `# test catalog
@locale en
---

hello = Hello, {$name}!

@param $count - Number of items
items =
  .input {$count :integer}
  .match $count
  one {{You have {$count} item.}}
  *   {{You have {$count} items.}}

[nav]
recipes = Recipes
`;

Deno.test("negotiateLocale: user language wins over Accept-Language", () => {
  assertEquals(negotiateLocale("it", "en-US,en;q=0.9"), "it");
  assertEquals(negotiateLocale("it-IT", "de"), "it");
});

Deno.test("negotiateLocale: logged-out uses Accept-Language then en", () => {
  assertEquals(negotiateLocale(null, "it-IT,it;q=0.9,en;q=0.8"), "it");
  assertEquals(negotiateLocale(undefined, "de-DE,de;q=0.9"), "en");
  assertEquals(negotiateLocale(null, null), "en");
  assertEquals(negotiateLocale("xx", "nl"), "en");
});

Deno.test("parseAcceptLanguage: orders by quality", () => {
  assertEquals(
    parseAcceptLanguage("en-US,en;q=0.9,it;q=0.8"),
    ["en-US", "en", "it"],
  );
  assertEquals(
    parseAcceptLanguage("it;q=0.4,en;q=0.8"),
    ["en", "it"],
  );
});

Deno.test("matchSupported: primary subtag of BCP 47", () => {
  assertEquals(matchSupported("it-IT"), "it");
  assertEquals(matchSupported("en"), "en");
  assertEquals(matchSupported("de-DE"), null);
});

Deno.test("extractParams: reads MF2 placeholders and :integer", () => {
  assertEquals(extractParams("Hello, {$name}!"), [
    { name: "name", tsType: "string" },
  ]);
  assertEquals(extractParams(".input {$count :integer}"), [
    { name: "count", tsType: "number" },
  ]);
});

Deno.test("compileCatalog: parse + flatten .mfr into nested keys", () => {
  const catalog = compileCatalog(FIXTURE);
  assertEquals(catalog.locale, "en");
  const keys = catalog.messages.map((m) => m.key);
  assertEquals(keys.includes("hello"), true);
  assertEquals(keys.includes("items"), true);
  assertEquals(keys.includes("nav.recipes"), true);
});

Deno.test("compiled messages format with the MF2 MessageFormat class", () => {
  const catalog = compileCatalog(FIXTURE);
  const hello = catalog.messages.find((m) => m.key === "hello")!;
  const items = catalog.messages.find((m) => m.key === "items")!;
  assertEquals(
    visible(new MessageFormat("en", hello.source).format({ name: "Luca" })),
    "Hello, Luca!",
  );
  assertEquals(
    visible(new MessageFormat("en", items.source).format({ count: 1 })),
    "You have 1 item.",
  );
  assertEquals(
    visible(new MessageFormat("en", items.source).format({ count: 3 })),
    "You have 3 items.",
  );
});

Deno.test("emitJavaScript: imports messageformat and exports formatters", () => {
  const js = emitJavaScript(compileCatalog(FIXTURE));
  assertEquals(js.includes('from "messageformat"'), true);
  assertEquals(js.includes("new MessageFormat"), true);
  assertEquals(js.includes("nav:"), true);
  assertEquals(js.includes("recipes:"), true);
  assertEquals(js.includes("@messageformat/core"), false);
});

Deno.test("emitTypeScript: types placeholders as required params", () => {
  const dts = emitTypeScript(compileCatalog(FIXTURE));
  assertEquals(dts.includes("name: string"), true);
  assertEquals(dts.includes("count: number"), true);
  assertEquals(dts.includes("readonly recipes:"), true);
});

Deno.test("English and Italian resource files compile", async () => {
  const enSrc = await Deno.readTextFile(
    new URL("../../locales/en.mfr", import.meta.url),
  );
  const itSrc = await Deno.readTextFile(
    new URL("../../locales/it.mfr", import.meta.url),
  );
  const en = compileCatalog(enSrc, "en");
  const it = compileCatalog(itSrc, "it");
  assertEquals(en.locale, "en");
  assertEquals(it.locale, "it");
  const enKeys = new Set(en.messages.map((m) => m.key));
  const itKeys = new Set(it.messages.map((m) => m.key));
  assertEquals(enKeys.has("nav.recipes"), true);
  assertEquals(itKeys.has("nav.recipes"), true);
  assertEquals(enKeys.has("profile.language"), true);
  assertEquals(itKeys.has("admin.title"), true);
  // Italian is a real catalog, not an empty stub.
  assertEquals(it.messages.length > 50, true);
  // Format a couple of shipped strings to prove they are valid MF2.
  const recipes = en.messages.find((m) => m.key === "nav.recipes")!;
  assertEquals(new MessageFormat("en", recipes.source).format(), "Recipes");
  const itRecipes = it.messages.find((m) => m.key === "nav.recipes")!;
  assertEquals(
    new MessageFormat("it", itRecipes.source).format(),
    "Ricette",
  );
});

Deno.test("Italian catalog covers every English key", async () => {
  const enSrc = await Deno.readTextFile(
    new URL("../../locales/en.mfr", import.meta.url),
  );
  const itSrc = await Deno.readTextFile(
    new URL("../../locales/it.mfr", import.meta.url),
  );
  const en = compileCatalog(enSrc, "en");
  const it = compileCatalog(itSrc, "it");
  const itKeys = new Set(it.messages.map((m) => m.key));
  const missing = en.messages.map((m) => m.key).filter((k) => !itKeys.has(k));
  assertEquals(missing, []);
});
