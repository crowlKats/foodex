import { assertEquals } from "@std/assert";
import {
  type ChoiceInfo,
  defaultSelection,
  deriveBranches,
  deriveChoices,
  hiddenOptionIds,
  projectVisible,
  selectionFromParams,
  selectionToParams,
} from "./recipe-choices.ts";

const choices: ChoiceInfo[] = [
  {
    id: "c1",
    key: "method",
    title: "Cooking method",
    options: [
      { id: "o1", key: "stovetop", title: "Stovetop" },
      { id: "o2", key: "oven", title: "Oven" },
    ],
  },
  {
    id: "c2",
    key: "topping",
    title: "Topping",
    options: [
      { id: "o3", key: "ganache", title: "Ganache" },
      { id: "o4", key: "buttercream", title: "Buttercream" },
      { id: "o5", key: "none", title: "None" },
    ],
  },
];

Deno.test("default selection picks the first option of every choice", () => {
  assertEquals(defaultSelection(choices), { c1: "o1", c2: "o3" });
  assertEquals(
    hiddenOptionIds(choices, defaultSelection(choices)),
    new Set([
      "o2",
      "o4",
      "o5",
    ]),
  );
  assertEquals(
    hiddenOptionIds(choices, { c1: "o2" }),
    new Set([
      "o1",
      "o4",
      "o5",
    ]),
  );
});

Deno.test("selection round-trips through query params", () => {
  const params = new URLSearchParams("x=1");
  selectionToParams(choices, { c1: "o2", c2: "o3" }, params);
  assertEquals(params.toString(), "x=1&choice.method=oven");
  assertEquals(selectionFromParams(choices, params), { c1: "o2", c2: "o3" });
  // Unknown option keys fall back to the default.
  assertEquals(
    selectionFromParams(choices, new URLSearchParams("choice.method=grill")),
    { c1: "o1", c2: "o3" },
  );
  // Reverting to the default removes the param again.
  selectionToParams(choices, { c1: "o1", c2: "o3" }, params);
  assertEquals(params.toString(), "x=1");
});

Deno.test("hidden nodes are spliced out of a linear chain", () => {
  // 1 → 2a → 2b → 3, as the list editor would chain them.
  const steps = [
    { id: "1", after: [] as number[], opt: null as string | null },
    { id: "2a", after: [0], opt: "a" },
    { id: "2b", after: [1], opt: "b" },
    { id: "3", after: [2], opt: null },
  ];
  const withA = projectVisible(steps, (s) => s.opt === "b");
  assertEquals(withA.nodes.map((s) => s.id), ["1", "2a", "3"]);
  assertEquals(withA.nodes.map((s) => s.after), [[], [0], [1]]);
  assertEquals(withA.indexMap, [0, 1, null, 2]);

  const withB = projectVisible(steps, (s) => s.opt === "a");
  assertEquals(withB.nodes.map((s) => s.id), ["1", "2b", "3"]);
  assertEquals(withB.nodes.map((s) => s.after), [[], [0], [1]]);
});

Deno.test("dependencies pass through a run of hidden nodes", () => {
  // 1 → 2a → 2a' → 3 and 1 → 2b → 3 (a graph-mode branch). Hide the
  // two-step option: 3 depends on 1 via the hidden run and on 2b directly.
  const steps = [
    { id: "1", after: [] as number[], opt: null as string | null },
    { id: "2a", after: [0], opt: "a" },
    { id: "2a2", after: [1], opt: "a" },
    { id: "2b", after: [0], opt: "b" },
    { id: "3", after: [2, 3], opt: null },
  ];
  const p = projectVisible(steps, (s) => s.opt === "a");
  assertEquals(p.nodes.map((s) => s.id), ["1", "2b", "3"]);
  // 3 inherits 1 through the hidden run, but 2b already implies it.
  assertEquals(p.nodes.map((s) => s.after), [[], [0], [1]]);
});

Deno.test("a fork's shared dependency is not repeated after the fork", () => {
  // 1 → (2a | 2b) → 3, both members after 1, 3 after both.
  const steps = [
    { id: "1", after: [] as number[], opt: null as string | null },
    { id: "2a", after: [0], opt: "a" },
    { id: "2b", after: [0], opt: "b" },
    { id: "3", after: [1, 2], opt: null },
  ];
  const p = projectVisible(steps, (s) => s.opt === "b");
  assertEquals(p.nodes.map((s) => s.id), ["1", "2a", "3"]);
  // 3 depends on 2a only; 1 is implied, not listed again.
  assertEquals(p.nodes.map((s) => s.after), [[], [0], [1]]);
});

Deno.test("nothing hidden leaves the list untouched", () => {
  const steps = [{ after: [] as number[] }, { after: [0] }, { after: [0, 1] }];
  const p = projectVisible(steps, () => false);
  assertEquals(p.nodes, steps);
  assertEquals(p.indexMap, [0, 1, 2]);
});

Deno.test("alternatives derive one choice per fork, first member default", () => {
  const choices = deriveChoices([
    { kind: "step", index: 1, title: "Sear on the stove", group: "sear" },
    { kind: "step", index: 2, title: "Sear in the oven", group: "sear" },
    { kind: "step", index: 4, title: "", group: "lonely" },
    { kind: "section", index: 1, title: "Ganache", group: "top" },
    { kind: "section", index: 2, title: "Ganache", group: "top" },
  ]);
  assertEquals(choices.map((c) => c.key), ["sear", "top"]);
  assertEquals(choices[0].options.map((o) => [o.key, o.title]), [
    ["sear-on-the-stove", "Sear on the stove"],
    ["sear-in-the-oven", "Sear in the oven"],
  ]);
  // Same titles inside one fork still get distinct keys.
  assertEquals(choices[1].options.map((o) => o.key), ["ganache", "ganache-2"]);
  assertEquals(choices[1].options[1].member.index, 2);
});

Deno.test("branches: steps only reachable from one member follow it", () => {
  // 0 forks into 1 and 2; 1 leads to 3 then 5; 2 leads to 4 then 5.
  const steps = [
    { after: [], alt: null },
    { after: [0], alt: "sear" },
    { after: [0], alt: "sear" },
    { after: [1], alt: null },
    { after: [2], alt: null },
    { after: [3, 4], alt: null },
  ];
  const b = deriveBranches(steps);
  assertEquals([...b.entries()].sort(), [[1, 1], [2, 2], [3, 1], [4, 2]]);
});

Deno.test("branches: a linear chain gives the first member its followers", () => {
  // 0, 1(A), 2, 3(B), 4 in a chain: 2 is A's; 4 is reachable from both.
  const steps = [
    { after: [], alt: null },
    { after: [0], alt: "x" },
    { after: [1], alt: null },
    { after: [2], alt: "x" },
    { after: [3], alt: null },
  ];
  const b = deriveBranches(steps);
  assertEquals([...b.entries()].sort(), [[1, 1], [2, 1], [3, 3]]);
});

Deno.test("branches: forks are scoped and lone members are not forks", () => {
  const steps = [
    { after: [], alt: "x", scope: 0 },
    { after: [], alt: "x", scope: 1 },
    { after: [0], alt: null, scope: 0 },
  ];
  assertEquals(deriveBranches(steps).size, 0);
});
