import { assert } from "@std/assert";
import { buildSystemPrompt } from "./system-prompt.ts";

Deno.test("buildSystemPrompt: attached photos beat the URL-import path", () => {
  const p = buildSystemPrompt();
  const photos = p.indexOf("## Attached photos");
  const url = p.indexOf("## Importing from a URL");
  assert(photos >= 0 && url > photos);
  assert(p.includes("those photos ARE the recipe source"));
  assert(p.includes("do not ask for a URL"));
});
