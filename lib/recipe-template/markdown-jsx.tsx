/** @jsxRuntime automatic */
/** @jsxImportSource preact */

/**
 * Markdown → JSX walker with placeholder splicing.
 *
 * The recipe template parser extracts every directive (`{{ }}`, `@step()`,
 * `@timer()`, `@recipe()`) before any markdown runs. To stitch the directives
 * back into the rendered markdown we replace each one with a placeholder of
 * the form `\uE000<idx>\uE001` (a pair of private-use Unicode chars around a
 * decimal index). Marked treats those chars as plain text so they survive
 * lexing unchanged. After tokenising, we walk the token tree producing Preact
 * VNodes and split text tokens on the placeholder pattern, substituting in
 * the resolved VNode for each slot.
 *
 * This layering is what keeps `*bar {{ foo * 2 }}*` rendering correctly: the
 * inner `*` operator is fully consumed inside the interpolation and never
 * reaches marked, so the outer `*` … `*` italic delimiters still pair up.
 */

import { marked, type Tokens } from "marked";
import type { ComponentChildren, VNode } from "preact";

const OPEN = "\uE000";
const CLOSE = "\uE001";
const PLACEHOLDER_RE = /\uE000(\d+)\uE001/g;

// Marked is configured globally to drop raw HTML — we don't want it leaking
// from user-authored step bodies.
marked.use({ renderer: { html: () => "" } });

export function placeholder(idx: number): string {
  return `${OPEN}${idx}${CLOSE}`;
}

/**
 * Render a string containing markdown + placeholders into Preact JSX.
 *
 * `resolve(idx)` is called once per placeholder occurrence and should return
 * the VNode (or plain string) to substitute in. Indices match those produced
 * by `placeholder(idx)`.
 */
export function renderMarkdown(
  source: string,
  resolve: (idx: number) => ComponentChildren,
): VNode {
  const tokens = marked.lexer(source);
  return <>{renderBlocks(tokens as Tokens.Generic[], resolve)}</>;
}

// ── Block tokens ───────────────────────────────────────────────────────────

function renderBlocks(
  tokens: Tokens.Generic[],
  resolve: (idx: number) => ComponentChildren,
): ComponentChildren[] {
  return tokens.map((t, i) => renderBlock(t, resolve, i));
}

function renderBlock(
  token: Tokens.Generic,
  resolve: (idx: number) => ComponentChildren,
  key: number,
): ComponentChildren {
  switch (token.type) {
    case "space":
      return null;
    case "paragraph":
      return (
        <p key={key}>
          {renderInline(token.tokens ?? [], resolve)}
        </p>
      );
    case "heading": {
      const t = token as Tokens.Heading;
      const inner = renderInline(t.tokens ?? [], resolve);
      switch (t.depth) {
        case 1:
          return <h1 key={key}>{inner}</h1>;
        case 2:
          return <h2 key={key}>{inner}</h2>;
        case 3:
          return <h3 key={key}>{inner}</h3>;
        case 4:
          return <h4 key={key}>{inner}</h4>;
        case 5:
          return <h5 key={key}>{inner}</h5>;
        default:
          return <h6 key={key}>{inner}</h6>;
      }
    }
    case "blockquote": {
      const t = token as Tokens.Blockquote;
      return (
        <blockquote key={key}>{renderBlocks(t.tokens, resolve)}</blockquote>
      );
    }
    case "hr":
      return <hr key={key} />;
    case "code": {
      const t = token as Tokens.Code;
      return (
        <pre key={key}>
          <code class={t.lang ? `language-${t.lang}` : undefined}>{t.text}</code>
        </pre>
      );
    }
    case "list": {
      const t = token as Tokens.List;
      const items = t.items.map((item, i) => (
        <li key={i}>{renderListItem(item, resolve)}</li>
      ));
      return t.ordered
        ? (
          <ol
            key={key}
            start={typeof t.start === "number" ? t.start : undefined}
          >
            {items}
          </ol>
        )
        : <ul key={key}>{items}</ul>;
    }
    case "html":
      // Globally stripped via marked.use({ renderer: { html: () => "" } }),
      // but the lexer still surfaces it; we ignore it here too.
      return null;
    case "text": {
      // A loose text block (e.g. inside a list item without a paragraph wrapper).
      const t = token as Tokens.Generic & { tokens?: Tokens.Generic[] };
      if (t.tokens) return renderInline(t.tokens, resolve);
      return splitText(token.raw ?? "", resolve);
    }
    default:
      // Unknown block: fall back to raw text, still splitting placeholders so
      // directives don't appear as `\uE000…` garbage.
      return splitText(token.raw ?? "", resolve);
  }
}

function renderListItem(
  item: Tokens.ListItem,
  resolve: (idx: number) => ComponentChildren,
): ComponentChildren {
  // List items contain either block tokens or loose inline tokens.
  const tokens = item.tokens ?? [];
  const isLoose = tokens.some((t) =>
    t.type === "paragraph" || t.type === "list"
  );
  if (isLoose) return renderBlocks(tokens, resolve);
  return renderInline(tokens, resolve);
}

// ── Inline tokens ──────────────────────────────────────────────────────────

function renderInline(
  tokens: Tokens.Generic[],
  resolve: (idx: number) => ComponentChildren,
): ComponentChildren[] {
  return tokens.flatMap((t, i) => renderInlineOne(t, resolve, i));
}

function renderInlineOne(
  token: Tokens.Generic,
  resolve: (idx: number) => ComponentChildren,
  key: number,
): ComponentChildren[] {
  switch (token.type) {
    case "text": {
      // Some text tokens carry inline children (e.g. when they contain entities
      // or autolinks). Prefer the structured form when available.
      const t = token as Tokens.Generic & { tokens?: Tokens.Generic[] };
      if (t.tokens && t.tokens.length > 0) {
        return renderInline(t.tokens, resolve);
      }
      return splitText(token.text ?? "", resolve);
    }
    case "escape":
      return splitText((token as Tokens.Escape).text, resolve);
    case "em":
      return [<em key={key}>{renderInline(token.tokens ?? [], resolve)}</em>];
    case "strong":
      return [
        <strong key={key}>{renderInline(token.tokens ?? [], resolve)}</strong>,
      ];
    case "del":
      return [<del key={key}>{renderInline(token.tokens ?? [], resolve)}</del>];
    case "codespan":
      return [<code key={key}>{(token as Tokens.Codespan).text}</code>];
    case "br":
      return [<br key={key} />];
    case "link": {
      const t = token as Tokens.Link;
      return [
        <a key={key} href={t.href} title={t.title ?? undefined}>
          {renderInline(t.tokens ?? [], resolve)}
        </a>,
      ];
    }
    case "image": {
      const t = token as Tokens.Image;
      return [
        <img
          key={key}
          src={t.href}
          alt={t.text}
          title={t.title ?? undefined}
        />,
      ];
    }
    case "html":
      return [];
    default:
      return splitText(token.raw ?? "", resolve);
  }
}

// ── Placeholder splitting ─────────────────────────────────────────────────

function splitText(
  text: string,
  resolve: (idx: number) => ComponentChildren,
): ComponentChildren[] {
  if (!text) return [];
  if (text.indexOf(OPEN) < 0) return [text];
  const out: ComponentChildren[] = [];
  let last = 0;
  PLACEHOLDER_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = PLACEHOLDER_RE.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push(resolve(parseInt(m[1], 10)));
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}
