/** @jsxRuntime automatic */
/** @jsxImportSource preact */

import { assertEquals, assertStringIncludes } from "@std/assert";
import { render } from "preact-render-to-string";
import { computeSectionLayout } from "../step-sections.ts";
import { renderTemplate, toolRefMap } from "./render.tsx";

function renderToHtml(
  source: string,
  opts?: Partial<Parameters<typeof renderTemplate>[1]>,
): string {
  const steps = [{ title: "", body: source, section_id: null }];
  const layout = computeSectionLayout(steps, undefined);
  const vnode = renderTemplate(source, {
    variables: { ratio: 1 },
    ingredients: {},
    steps,
    layout,
    ...opts,
  });
  return render(vnode);
}

Deno.test("render: bold containing interpolation keeps `<strong>` intact", () => {
  const html = renderToHtml("**bold {{ 2 + 3 }}**", {
    variables: { ratio: 1 },
  });
  // `<strong>bold 5</strong>` surrounded by `<p>`.
  assertStringIncludes(html, "<strong");
  assertStringIncludes(html, "</strong>");
  assertStringIncludes(html, "5");
  // No stray asterisks should leak as text.
  assertEquals(html.includes("**"), false);
});

Deno.test("render: italic with `*` inside `{{ foo * 2 }}` does not break", () => {
  // The key test: the `*` inside `{{ }}` is a multiplication operator, not
  // an italic delimiter. The outer `*…*` must still produce <em>.
  const html = renderToHtml("*bar {{ 2 * 3 }} baz*", {
    variables: { ratio: 1 },
  });
  assertStringIncludes(html, "<em");
  assertStringIncludes(html, "</em>");
  assertStringIncludes(html, "6");
  // The italic must wrap the result, i.e. `<em>bar 6 baz</em>`.
  assertStringIncludes(html, "bar");
  assertStringIncludes(html, "baz");
});

Deno.test("render: invalid expression renders as inline error span", () => {
  const html = renderToHtml("{{ 2 + }}", { variables: { ratio: 1 } });
  assertStringIncludes(html, "recipe-template-error");
});

Deno.test("render: timer button is a real VNode with data attrs", () => {
  const html = renderToHtml("wait @timer(15m)");
  assertStringIncludes(html, "recipe-timer-btn");
  assertStringIncludes(html, 'data-seconds="900"');
  assertStringIncludes(html, "15 min");
});

Deno.test("render: range timer carries both bounds and a range label", () => {
  const html = renderToHtml("cook for @timer(4-6m)");
  assertStringIncludes(html, 'data-seconds="240"');
  assertStringIncludes(html, 'data-seconds-max="360"');
  assertStringIncludes(html, "4-6 min");
});

Deno.test("render: paragraph + list", () => {
  const html = renderToHtml("First paragraph.\n\n- one\n- two\n");
  assertStringIncludes(html, "First paragraph.");
  assertStringIncludes(html, "<ul");
  assertStringIncludes(html, "one");
  assertStringIncludes(html, "two");
});

Deno.test("render: ingredient interpolation formats as amount+unit+name", () => {
  const html = renderToHtml("Add {{ flour }} to the bowl.", {
    variables: { ratio: 1 },
    ingredients: {
      flour: { amount: 200, unit: "g", name: "all-purpose flour" },
    },
  });
  assertStringIncludes(html, "200 g all-purpose flour");
});

Deno.test("render: capitalised ingredient ref capitalises the name", () => {
  const html = renderToHtml("{{ Flour }} sifted.", {
    variables: { ratio: 1 },
    ingredients: {
      flour: { amount: 200, unit: "g", name: "all-purpose flour" },
    },
  });
  assertStringIncludes(html, "200 g All-purpose flour");
});

Deno.test("render: {{ tray }} renders the tray dimensions as text", () => {
  const html = renderToHtml("Line a {{ tray }} tray with parchment.", {
    tray: { value: 20, value2: 30, value3: 5 },
  });
  assertStringIncludes(html, "20 x 30 x 5 cm");
});

Deno.test("render: {{ tray }} without tray dims is an inline error", () => {
  const html = renderToHtml("Use a {{ tray }}.");
  assertStringIncludes(html, "recipe-template-error");
});

Deno.test("render: tray in math is an inline error", () => {
  const html = renderToHtml("{{ tray * 2 }}", {
    tray: { value: 20, value2: 30 },
  });
  assertStringIncludes(html, "recipe-template-error");
});

Deno.test("render: @tool(name) links the tool and shows its settings", () => {
  const html = renderToHtml("Preheat the @tool(oven) now.", {
    tools: toolRefMap([{ id: "t1", name: "Oven", settings: "180 °C" }]),
  });
  assertStringIncludes(html, 'href="/tools/t1"');
  // Label keeps the typed casing; settings follow in parentheses.
  assertStringIncludes(html, ">oven</a>");
  assertStringIncludes(html, "(180 °C)");
});

Deno.test("render: @tool(name) without settings renders just the link", () => {
  const html = renderToHtml("Use the @tool(Stand Mixer).", {
    tools: toolRefMap([{ id: "t2", name: "stand mixer" }]),
  });
  assertStringIncludes(html, 'href="/tools/t2"');
  assertStringIncludes(html, ">Stand Mixer</a>");
  assertEquals(html.includes("()"), false);
});

Deno.test("render: @tool(name) not attached is an inline error", () => {
  const html = renderToHtml("Use the @tool(blender).", {
    tools: toolRefMap([{ id: "t1", name: "Oven" }]),
  });
  assertStringIncludes(html, "recipe-template-error");
});

Deno.test("render: @tool(name, settings) overrides the default settings", () => {
  const html = renderToHtml(
    "Cream in the @tool(mixer, medium speed), then @tool(mixer, high speed).",
    { tools: toolRefMap([{ id: "t3", name: "Mixer", settings: "speed 2" }]) },
  );
  assertStringIncludes(html, "(medium speed)");
  assertStringIncludes(html, "(high speed)");
  assertEquals(html.includes("(speed 2)"), false);
});

Deno.test("render: @tool(name) falls back to the default settings", () => {
  const html = renderToHtml("Whip with the @tool(mixer).", {
    tools: toolRefMap([{ id: "t3", name: "Mixer", settings: "speed 2" }]),
  });
  assertStringIncludes(html, "(speed 2)");
});
