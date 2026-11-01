import { flatten, parse } from "@luca/messageformat-resources";
import { parseMessage } from "messageformat";
import { dirname, join, relative } from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";

const ROOT = new URL("..", import.meta.url).pathname;

// Extract variable names from a MessageFormat 2 message using the parser
function extractVariables(message: string): string[] {
  const variables = new Set<string>();
  const ast = parseMessage(message);

  // Recursively traverse the AST to find variable references
  function visit(node: unknown): void {
    if (!node || typeof node !== "object") return;

    if (Array.isArray(node)) {
      for (const item of node) visit(item);
      return;
    }

    const obj = node as Record<string, unknown>;

    // VariableRef nodes have type "variable" and a "name" property
    if (obj.type === "variable" && typeof obj.name === "string") {
      variables.add(obj.name);
    }

    // Recurse into all properties
    for (const value of Object.values(obj)) {
      visit(value);
    }
  }

  visit(ast);
  return [...variables].sort();
}

function generateTypes(filePath: string): void {
  const code = Deno.readTextFileSync(filePath);
  const resource = parse(code);
  const messages = flatten(resource);

  const entries = [...messages.entries()];
  const relativePath = relative(ROOT, filePath);
  const dtsDir = join(ROOT, "_types", dirname(relativePath));
  const dtsPath = join(ROOT, "_types", relativePath + ".d.ts");

  // Build Messages type with argument types for each key
  const messageTypes = entries.map(([key, { message }]) => {
    const vars = extractVariables(message);
    const argsType = vars.length === 0
      ? "Record<string, never>"
      : `{ ${vars.map((v) => `${v}: unknown`).join("; ")} }`;
    return `  ${JSON.stringify(key)}: ${argsType};`;
  });

  const dtsContent =
    `import type { Bundle } from "@/components/Translation.tsx";

export type Messages = {
${messageTypes.join("\n")}
};

declare const bundle: Bundle<Messages>;
export default bundle;
`;

  mkdirSync(dtsDir, { recursive: true });
  writeFileSync(dtsPath, dtsContent);
}

// Find and process all .mfr files
async function findMfrFiles(
  dir: string,
  files: string[] = [],
): Promise<string[]> {
  try {
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
  } catch {
    // Ignore permission errors etc.
  }
  return files;
}

async function processAllFiles(): Promise<void> {
  const files = await findMfrFiles(ROOT);
  for (const file of files) {
    generateTypes(file);
  }
}

async function watch(): Promise<void> {
  const watcher = Deno.watchFs(ROOT, { recursive: true });

  for await (const event of watcher) {
    if (event.kind !== "modify" && event.kind !== "create") continue;

    for (const path of event.paths) {
      if (!path.endsWith(".mfr")) continue;

      // Small debounce to avoid duplicate events
      await new Promise((r) => setTimeout(r, 50));

      try {
        generateTypes(path);
      } catch {
        // Ignore errors (file may be mid-write)
      }
    }
  }
}

// Main
await processAllFiles();

// Watch mode if --watch flag is passed
if (Deno.args.includes("--watch")) {
  await watch();
}
