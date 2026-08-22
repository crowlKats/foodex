import type { Plugin } from "vite";
import { flatten, parse } from "@luca/messageformat-resources";

export default function mfrPlugin(): Plugin {
  return {
    name: "vite-plugin-mfr",
    transform(code, id) {
      if (!id.endsWith(".mfr")) return null;

      const resource = parse(code);
      const messages = flatten(resource);

      // Get locale from resource metadata
      const locale = resource.meta.find((m) => m.key === "locale")?.value ??
        "en";

      const entries = [...messages.entries()];

      // Generate code that lazily creates MessageFormat instances
      const output = `
import { MessageFormat } from "messageformat";

const locale = ${JSON.stringify(locale)};
const sources = new Map(${
        JSON.stringify(entries.map(([key, { message }]) => [key, message]))
      });
const cache = new Map();

export default {
  get(key) {
    let msg = cache.get(key);
    if (msg) return msg;
    const source = sources.get(key);
    if (!source) throw new Error(\`Unknown message key: \${key}\`);
    msg = new MessageFormat(locale, source);
    cache.set(key, msg);
    return msg;
  }
};
`;
      return { code: output, map: null };
    },
  };
}
