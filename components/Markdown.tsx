import { marked } from "marked";
import type { ComponentChildren } from "preact";

// Render a safe subset of Markdown (bold, italic, code, links, lists, etc.) to
// Preact vnodes. We map marked's tokens to elements ourselves and never emit raw
// HTML, so untrusted model/user text can't inject markup.

// deno-lint-ignore no-explicit-any
type Token = any;

// Only in-app links to a recipe or an ingredient are allowed; anything else is
// rendered as plain text (the assistant is told to use only these).
function isAllowedHref(href: string): boolean {
  return /^\/(recipes|ingredients)\/[^\s)]+$/.test(href);
}

function inline(tokens: Token[] | undefined): ComponentChildren {
  if (!tokens) return null;
  return tokens.map((t, i) => {
    switch (t.type) {
      case "strong":
        return <strong key={i}>{inline(t.tokens)}</strong>;
      case "em":
        return <em key={i}>{inline(t.tokens)}</em>;
      case "del":
        return <del key={i}>{inline(t.tokens)}</del>;
      case "codespan":
        return <code key={i} class="code-hint">{t.text}</code>;
      case "link": {
        const children = inline(t.tokens) ?? t.text;
        if (!isAllowedHref(String(t.href ?? ""))) {
          return <span key={i}>{children}</span>;
        }
        return <a key={i} href={t.href} class="link">{children}</a>;
      }
      case "br":
        return <br key={i} />;
      case "text":
        return t.tokens ? <span key={i}>{inline(t.tokens)}</span> : t.text;
      default:
        return t.raw ?? t.text ?? "";
    }
  });
}

function itemContent(tokens: Token[] | undefined): ComponentChildren {
  if (!tokens) return null;
  return tokens.map((t, i) => {
    if (t.type === "text") {
      return <span key={i}>{t.tokens ? inline(t.tokens) : t.text}</span>;
    }
    if (t.type === "list") return blocks([t]);
    return <span key={i}>{inline(t.tokens) ?? t.text}</span>;
  });
}

function blocks(tokens: Token[]): ComponentChildren {
  return tokens.map((t, i) => {
    switch (t.type) {
      case "paragraph":
        return <p key={i}>{inline(t.tokens)}</p>;
      case "heading":
        return <p key={i} class="font-semibold">{inline(t.tokens)}</p>;
      case "list": {
        const items = t.items.map((it: Token, j: number) => (
          <li key={j}>{itemContent(it.tokens)}</li>
        ));
        return t.ordered
          ? <ol key={i} class="list-decimal pl-5 space-y-0.5">{items}</ol>
          : <ul key={i} class="list-disc pl-5 space-y-0.5">{items}</ul>;
      }
      case "blockquote":
        return (
          <blockquote
            key={i}
            class="border-l-2 border-stone-300 dark:border-stone-600 pl-2 text-stone-500"
          >
            {blocks(t.tokens)}
          </blockquote>
        );
      case "code":
        return (
          <pre
            key={i}
            class="bg-stone-100 dark:bg-stone-800 p-2 overflow-x-auto text-xs font-mono"
          >{t.text}</pre>
        );
      case "hr":
        return <hr key={i} class="border-stone-200 dark:border-stone-700" />;
      case "text":
        return <p key={i}>{t.tokens ? inline(t.tokens) : t.text}</p>;
      case "space":
        return null;
      default:
        return null;
    }
  });
}

export function Markdown(
  { text, class: cls }: { text: string; class?: string },
) {
  const tokens = marked.lexer(text);
  return <div class={`space-y-2 ${cls ?? ""}`}>{blocks(tokens)}</div>;
}
