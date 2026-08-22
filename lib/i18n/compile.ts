/**
 * Compile a MessageFormat 2 resource (.mfr) into JS and TypeScript.
 *
 * Parsing uses `@luca/messageformat-resources` (`parse` + `flatten`). The
 * emitted module formats each message with the MF2 `MessageFormat` class
 * from `messageformat` — not ICU MessageFormat 1.
 */

import { flatten, parse } from "@luca/messageformat-resources";
import { DEFAULT_LOCALE, matchSupported } from "./locale.ts";

export interface MessageParam {
  name: string;
  tsType: "string" | "number" | "Date";
}

export interface CompiledMessage {
  key: string;
  source: string;
  params: MessageParam[];
}

export interface CompiledCatalog {
  locale: string;
  messages: CompiledMessage[];
}

const PARAM_RE = /\{\$([A-Za-z][A-Za-z0-9_]*)(?:\s*:([A-Za-z][A-Za-z0-9]*))?/g;

const IDENT_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function extractParams(source: string): MessageParam[] {
  const found = new Map<string, MessageParam>();
  PARAM_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = PARAM_RE.exec(source)) !== null) {
    const name = match[1];
    if (found.has(name)) continue;
    const fn = (match[2] ?? "").toLowerCase();
    let tsType: MessageParam["tsType"] = "string";
    if (fn === "integer" || fn === "number") tsType = "number";
    else if (fn === "datetime" || fn === "date" || fn === "time") {
      tsType = "Date";
    }
    found.set(name, { name, tsType });
  }
  return [...found.values()];
}

export function compileCatalog(
  source: string,
  fallbackLocale = DEFAULT_LOCALE,
): CompiledCatalog {
  const resource = parse(source);
  const flat = flatten(resource);
  const metaLocale = resource.meta.find((m) => m.key === "locale")?.value;
  const locale = matchSupported(metaLocale) ??
    matchSupported(fallbackLocale) ??
    DEFAULT_LOCALE;

  const messages: CompiledMessage[] = [];
  for (const [key, entry] of flat) {
    messages.push({
      key,
      source: entry.message,
      params: extractParams(entry.message),
    });
  }
  messages.sort((a, b) => a.key.localeCompare(b.key));
  return { locale, messages };
}

type Tree =
  | { kind: "msg"; source: string; params: MessageParam[] }
  | { kind: "obj"; children: Map<string, Tree> };

function toTree(messages: CompiledMessage[]): Tree {
  const root: Tree = { kind: "obj", children: new Map() };
  for (const msg of messages) {
    const parts = msg.key.split(".");
    let node = root;
    for (let i = 0; i < parts.length; i++) {
      if (node.kind !== "obj") {
        throw new Error(`Cannot nest under message key '${msg.key}'`);
      }
      const part = parts[i];
      const last = i === parts.length - 1;
      if (last) {
        if (node.children.has(part)) {
          throw new Error(`Duplicate or conflicting message key '${msg.key}'`);
        }
        node.children.set(part, {
          kind: "msg",
          source: msg.source,
          params: msg.params,
        });
      } else {
        let next = node.children.get(part);
        if (!next) {
          next = { kind: "obj", children: new Map() };
          node.children.set(part, next);
        }
        if (next.kind !== "obj") {
          throw new Error(`Cannot nest under message key '${msg.key}'`);
        }
        node = next;
      }
    }
  }
  return root;
}

function jsKey(name: string): string {
  return IDENT_RE.test(name) ? name : JSON.stringify(name);
}

function emitJsNode(node: Tree, indent: string): string {
  if (node.kind === "msg") {
    return `msg(${JSON.stringify(node.source)})`;
  }
  const lines: string[] = ["{"];
  const inner = indent + "  ";
  for (const [name, child] of node.children) {
    lines.push(`${inner}${jsKey(name)}: ${emitJsNode(child, inner)},`);
  }
  lines.push(`${indent}}`);
  return lines.join("\n");
}

/**
 * JS module: default export is a nested object of formatter functions.
 * Each function is `(params?) => string`, backed by `MessageFormat`.
 */
export function emitJavaScript(catalog: CompiledCatalog): string {
  const tree = toTree(catalog.messages);
  const body = emitJsNode(tree, "");
  return `import { MessageFormat } from "messageformat";

const locale = ${JSON.stringify(catalog.locale)};

function msg(source) {
  const mf = new MessageFormat(locale, source);
  return (params) => mf.format(params ?? {});
}

const messages = ${body};

export default messages;
export { locale };
`;
}

function tsParams(params: MessageParam[]): string {
  if (params.length === 0) return "";
  const fields = params
    .map((p) => `${p.name}: ${p.tsType}`)
    .join("; ");
  return `{ ${fields} }`;
}

function emitDtsNode(node: Tree, indent: string): string {
  if (node.kind === "msg") {
    const p = tsParams(node.params);
    return p ? `Msg<${p}>` : "Msg";
  }
  const lines: string[] = ["{"];
  const inner = indent + "  ";
  for (const [name, child] of node.children) {
    lines.push(
      `${inner}readonly ${jsKey(name)}: ${emitDtsNode(child, inner)};`,
    );
  }
  lines.push(`${indent}}`);
  return lines.join("\n");
}

/**
 * Declaration file so `import messages from "./en.mfr"` is typed from the
 * catalog keys (and MF2 placeholders become required params).
 */
export function emitTypeScript(catalog: CompiledCatalog): string {
  const tree = toTree(catalog.messages);
  const shape = emitDtsNode(tree, "");
  return `type Msg<P = void> =
  [P] extends [void] ? (params?: Record<string, never>) => string
    : (params: P) => string;

declare const messages: ${shape};

export default messages;
export const locale: ${JSON.stringify(catalog.locale)};
`;
}
