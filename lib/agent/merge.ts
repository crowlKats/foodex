// Patch model for staged modifications.
//
// A modification is stored as a base snapshot plus an ordered list of patch ops.
// Ops key on stable identifiers (ingredient key, step id, section key, tool id,
// referenced recipe id, tag value) — NEVER array indices, so they survive
// concurrent reordering. `applyPatch` folds ops onto the base; `changedPaths` /
// `overlappingChangedPaths` power the path-level 3-way merge used at apply time.

export type Collection =
  | "ingredients"
  | "steps"
  | "sections"
  | "tools"
  | "refs"
  | "tags";

/** Scalar field set: `path` is a (possibly dotted) top-level field. */
export interface ScalarSet {
  op: "set";
  path: string;
  value: unknown;
}
export interface CollectionAdd {
  op: "add";
  collection: Collection;
  value: Record<string, unknown>;
}
export interface CollectionSet {
  op: "set";
  collection: Collection;
  key: string;
  field: string;
  value: unknown;
}
export interface CollectionRemove {
  op: "remove";
  collection: Collection;
  key: string;
}
export interface CollectionReorder {
  op: "reorder";
  collection: Collection;
  order: string[];
}

export type PatchOp =
  | ScalarSet
  | CollectionAdd
  | CollectionSet
  | CollectionRemove
  | CollectionReorder;

/** Which array field holds a collection, and the attribute that identifies a row. */
export interface MergeSchema {
  collections: Partial<Record<Collection, string>>;
}

/**
 * Recipes: every child collection is keyed by a stable identifier. `meal_types`
 * and `dietary_tags` are modelled as scalar array fields (a whole-array `set`),
 * not keyed collections — tag edits are add/remove over a small fixed enum.
 */
export const RECIPE_SCHEMA: MergeSchema = {
  collections: {
    ingredients: "key",
    steps: "id",
    sections: "key",
    tools: "tool_id",
    refs: "referenced_recipe_id",
  },
};

/** Ingredient entities are flat (name/unit/density); no collections. */
export const INGREDIENT_SCHEMA: MergeSchema = { collections: {} };

type Obj = Record<string, unknown>;

function isScalarSet(op: PatchOp): op is ScalarSet {
  return op.op === "set" && "path" in op;
}

/** Stable key for a collection row. Tags have no single id column. */
function itemKey(collection: Collection, item: Obj): string {
  if (collection === "tags") {
    return `${String(item.tag_type ?? "")}:${String(item.tag_value ?? "")}`;
  }
  const attr = RECIPE_SCHEMA.collections[collection] ?? "key";
  return String(item[attr] ?? "");
}

export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null) return a === b;
  if (typeof a !== typeof b) return false;
  if (typeof a !== "object") return a === b;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) {
      return false;
    }
    return a.every((v, i) => deepEqual(v, b[i]));
  }
  const ao = a as Obj, bo = b as Obj;
  const ak = Object.keys(ao), bk = Object.keys(bo);
  if (ak.length !== bk.length) return false;
  return ak.every((k) => k in bo && deepEqual(ao[k], bo[k]));
}

function clone<T>(v: T): T {
  return structuredClone(v);
}

function setPath(obj: Obj, path: string, value: unknown): void {
  const parts = path.split(".");
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i];
    if (typeof cur[p] !== "object" || cur[p] === null) cur[p] = {};
    cur = cur[p] as Obj;
  }
  cur[parts[parts.length - 1]] = value;
}

/** Apply an ordered list of ops onto a deep clone of `base`. */
export function applyPatch<T extends Obj>(base: T, ops: PatchOp[]): T {
  const out: Obj = clone(base);
  for (const op of ops) {
    if (isScalarSet(op)) {
      setPath(out, op.path, op.value);
      continue;
    }
    const field = op.collection;
    const list = (Array.isArray(out[field]) ? out[field] : []) as Obj[];
    switch (op.op) {
      case "add": {
        const k = itemKey(field, op.value);
        const idx = list.findIndex((it) => itemKey(field, it) === k);
        if (idx >= 0) list[idx] = op.value; // replace-or-append (idempotent)
        else list.push(op.value);
        break;
      }
      case "set": {
        const it = list.find((it) => itemKey(field, it) === op.key);
        if (it) it[op.field] = op.value;
        break;
      }
      case "remove": {
        out[field] = list.filter((it) => itemKey(field, it) !== op.key);
        break;
      }
      case "reorder": {
        const pos = new Map(op.order.map((k, i) => [k, i]));
        out[field] = [...list].sort((a, b) => {
          const ai = pos.get(itemKey(field, a)) ?? Number.MAX_SAFE_INTEGER;
          const bi = pos.get(itemKey(field, b)) ?? Number.MAX_SAFE_INTEGER;
          return ai - bi;
        });
        break;
      }
    }
    if (op.op !== "remove" && op.op !== "reorder") out[field] = list;
  }
  return out as T;
}

/** The path signature an op writes to (used for conflict detection). */
export function pathOf(op: PatchOp): string {
  if (isScalarSet(op)) return op.path;
  switch (op.op) {
    case "add":
      return `${op.collection}[${itemKey(op.collection, op.value)}]`;
    case "set":
      return `${op.collection}[${op.key}].${op.field}`;
    case "remove":
      return `${op.collection}[${op.key}]`;
    case "reorder":
      return `${op.collection}.__order`;
  }
}

/**
 * Set of path signatures where `live` differs from `base`. Scalars compare
 * per-field; collection rows compare per-item (`collection[key]`); order
 * changes register as `collection.__order`.
 */
export function changedPaths(
  base: Obj,
  live: Obj,
  schema: MergeSchema,
): Set<string> {
  const out = new Set<string>();
  const collFields = new Set(Object.keys(schema.collections));

  // Scalars: every top-level key that isn't a collection.
  const scalarKeys = new Set(
    [...Object.keys(base), ...Object.keys(live)].filter((k) =>
      !collFields.has(k)
    ),
  );
  for (const k of scalarKeys) {
    if (!deepEqual(base[k], live[k])) out.add(k);
  }

  // Collections.
  for (const field of collFields) {
    const c = field as Collection;
    const baseList = (Array.isArray(base[field]) ? base[field] : []) as Obj[];
    const liveList = (Array.isArray(live[field]) ? live[field] : []) as Obj[];
    const baseMap = new Map(baseList.map((it) => [itemKey(c, it), it]));
    const liveMap = new Map(liveList.map((it) => [itemKey(c, it), it]));
    for (const key of new Set([...baseMap.keys(), ...liveMap.keys()])) {
      if (!deepEqual(baseMap.get(key), liveMap.get(key))) {
        out.add(`${field}[${key}]`);
      }
    }
    const baseOrder = baseList.map((it) => itemKey(c, it));
    const liveOrder = liveList.map((it) => itemKey(c, it));
    if (!deepEqual(baseOrder, liveOrder)) out.add(`${field}.__order`);
  }
  return out;
}

/**
 * Compute patch ops that turn `oldO` into `newO`, keyed by identifier (never
 * index). Used to translate a user's full-object panel edit into the same op
 * representation the agent produces, so both feed the apply-time 3-way merge.
 */
export function diffToOps(
  oldO: Obj,
  newO: Obj,
  schema: MergeSchema,
): PatchOp[] {
  const ops: PatchOp[] = [];
  const collFields = new Set(Object.keys(schema.collections));

  const scalarKeys = new Set(
    [...Object.keys(oldO), ...Object.keys(newO)].filter((k) =>
      !collFields.has(k)
    ),
  );
  for (const k of scalarKeys) {
    if (!deepEqual(oldO[k], newO[k])) {
      ops.push({ op: "set", path: k, value: newO[k] });
    }
  }

  for (const field of collFields) {
    const c = field as Collection;
    const oldList = (Array.isArray(oldO[field]) ? oldO[field] : []) as Obj[];
    const newList = (Array.isArray(newO[field]) ? newO[field] : []) as Obj[];
    const oldMap = new Map(oldList.map((it) => [itemKey(c, it), it]));
    const newMap = new Map(newList.map((it) => [itemKey(c, it), it]));

    for (const key of oldMap.keys()) {
      if (!newMap.has(key)) ops.push({ op: "remove", collection: c, key });
    }
    for (const [key, item] of newMap) {
      const prev = oldMap.get(key);
      if (!prev) {
        ops.push({ op: "add", collection: c, value: item });
        continue;
      }
      const fields = new Set([...Object.keys(prev), ...Object.keys(item)]);
      for (const f of fields) {
        if (!deepEqual(prev[f], item[f])) {
          ops.push({ op: "set", collection: c, key, field: f, value: item[f] });
        }
      }
    }
    const oldOrder = oldList.map((it) => itemKey(c, it));
    const newOrder = newList.map((it) => itemKey(c, it));
    if (!deepEqual(oldOrder, newOrder)) {
      ops.push({ op: "reorder", collection: c, order: newOrder });
    }
  }
  return ops;
}

/** Two path signatures overlap if either is a prefix of the other. */
function overlaps(a: string, b: string): boolean {
  return a === b || a.startsWith(b + ".") || b.startsWith(a + ".");
}

/**
 * Path-level 3-way conflict check. Returns the op path signatures that collide
 * with a concurrent change in `live` (relative to `base`). Empty ⇒ the patch
 * merges cleanly onto `live`.
 */
export function overlappingChangedPaths(
  base: Obj,
  live: Obj,
  ops: PatchOp[],
  schema: MergeSchema,
): string[] {
  const changed = changedPaths(base, live, schema);
  const conflicts = new Set<string>();
  for (const op of ops) {
    const p = pathOf(op);
    for (const c of changed) {
      if (overlaps(p, c)) {
        conflicts.add(p);
        break;
      }
    }
  }
  return [...conflicts];
}
