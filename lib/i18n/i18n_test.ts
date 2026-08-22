import { assertEquals } from "@std/assert";
import { flatten, parse } from "@luca/messageformat-resources";
import { MessageFormat, parseMessage } from "messageformat";
import { join } from "node:path";
import {
  matchSupported,
  negotiateLocale,
  parseAcceptLanguage,
} from "./locale.ts";

/** MF2 wraps interpolations in bidi isolates (U+2068/U+2069). */
function visible(s: string): string {
  return s.replace(/[\u2066-\u2069]/g, "");
}

const ROOT = new URL("../../", import.meta.url).pathname;

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

Deno.test("parse + flatten .mfr into dotted keys", () => {
  const resource = parse(FIXTURE);
  const messages = flatten(resource);
  assertEquals(resource.meta.find((m) => m.key === "locale")?.value, "en");
  assertEquals(messages.has("hello"), true);
  assertEquals(messages.has("items"), true);
  assertEquals(messages.has("nav.recipes"), true);
});

Deno.test("compiled messages format with the MF2 MessageFormat class", () => {
  const messages = flatten(parse(FIXTURE));
  const hello = messages.get("hello")!.message;
  const items = messages.get("items")!.message;
  assertEquals(
    visible(new MessageFormat("en", hello).format({ name: "Luca" })),
    "Hello, Luca!",
  );
  assertEquals(
    visible(new MessageFormat("en", items).format({ count: 1 })),
    "You have 1 item.",
  );
  assertEquals(
    visible(new MessageFormat("en", items).format({ count: 3 })),
    "You have 3 items.",
  );
});

Deno.test("vite-plugin-mfr: lazy get(key) + MessageFormat, not ICU MF1", async () => {
  const src = await Deno.readTextFile(
    new URL("../../vite-plugin-mfr.ts", import.meta.url),
  );
  assertEquals(src.includes('from "messageformat"'), true);
  assertEquals(src.includes("new MessageFormat"), true);
  assertEquals(src.includes("get(key)"), true);
  assertEquals(src.includes("@messageformat/core"), false);
  assertEquals(src.includes("emitTypeScript"), false);
});

Deno.test("generate-mfr-types: Bundle + parseMessage vars as unknown", async () => {
  const src = await Deno.readTextFile(
    new URL("../../scripts/generate-mfr-types.ts", import.meta.url),
  );
  assertEquals(src.includes("Bundle<Messages>"), true);
  assertEquals(src.includes('from "@/components/Translation.tsx"'), true);
  assertEquals(src.includes("_types"), true);
  assertEquals(src.includes("parseMessage"), true);
  assertEquals(src.includes("unknown"), true);

  const variables = new Set<string>();
  function visit(node: unknown): void {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      for (const item of node) visit(item);
      return;
    }
    const obj = node as Record<string, unknown>;
    if (obj.type === "variable" && typeof obj.name === "string") {
      variables.add(obj.name);
    }
    for (const value of Object.values(obj)) visit(value);
  }
  visit(parseMessage("Hello, {$name}!"));
  assertEquals([...variables], ["name"]);
});

async function findMfrFiles(
  dir: string,
  files: string[] = [],
): Promise<string[]> {
  for await (const entry of Deno.readDir(dir)) {
    const path = join(dir, entry.name);
    if (
      entry.isDirectory &&
      !entry.name.startsWith("_") &&
      !entry.name.startsWith(".") &&
      entry.name !== "node_modules"
    ) {
      await findMfrFiles(path, files);
    } else if (entry.isFile && entry.name.endsWith(".mfr")) {
      files.push(path);
    }
  }
  return files;
}

Deno.test("every .en.mfr has a matching .it.mfr with the same keys", async () => {
  const files = await findMfrFiles(ROOT);
  const enFiles = files.filter((f) => f.endsWith(".en.mfr"));
  assertEquals(enFiles.length > 10, true);
  for (const enPath of enFiles) {
    const itPath = enPath.replace(/\.en\.mfr$/, ".it.mfr");
    const enSrc = await Deno.readTextFile(enPath);
    const itSrc = await Deno.readTextFile(itPath);
    const enKeys = [...flatten(parse(enSrc)).keys()].sort();
    const itKeys = [...flatten(parse(itSrc)).keys()].sort();
    assertEquals(itKeys, enKeys, `key mismatch in ${enPath}`);
  }
});

Deno.test("shared catalog holds common/error strings; pages do not duplicate them", async () => {
  const sharedEn = flatten(
    parse(await Deno.readTextFile(join(ROOT, "locales/shared.en.mfr"))),
  );
  assertEquals(sharedEn.has("common.save"), true);
  assertEquals(sharedEn.has("error.needHousehold"), true);
  assertEquals(sharedEn.has("language.it"), true);

  const profile = flatten(
    parse(
      await Deno.readTextFile(join(ROOT, "routes/profile/index.en.mfr")),
    ),
  );
  assertEquals(profile.has("profile.title"), true);
  assertEquals(profile.has("common.save"), false);
  assertEquals(profile.has("language.en"), false);

  const nav = flatten(
    parse(await Deno.readTextFile(join(ROOT, "components/Nav.en.mfr"))),
  );
  assertEquals(nav.has("nav.recipes"), true);
  assertEquals(nav.has("common.save"), false);
});

Deno.test("Nav English and Italian format as valid MF2", async () => {
  const en = flatten(
    parse(await Deno.readTextFile(join(ROOT, "components/Nav.en.mfr"))),
  );
  const it = flatten(
    parse(await Deno.readTextFile(join(ROOT, "components/Nav.it.mfr"))),
  );
  const recipes = en.get("nav.recipes")!.message;
  const itRecipes = it.get("nav.recipes")!.message;
  assertEquals(new MessageFormat("en", recipes).format(), "Recipes");
  assertEquals(new MessageFormat("it", itRecipes).format(), "Ricette");
});

Deno.test("Italian shared catalog is a real catalog, not an empty stub", async () => {
  const it = flatten(
    parse(await Deno.readTextFile(join(ROOT, "locales/shared.it.mfr"))),
  );
  assertEquals(it.size > 20, true);
  const save = it.get("common.save")!.message;
  assertEquals(new MessageFormat("it", save).format(), "Salva");
});
