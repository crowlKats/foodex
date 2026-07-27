import type { QueryFn } from "./db/mod.ts";
import type { UnitSystem } from "./lib/unit-display.ts";

export interface User {
  id: string;
  name: string;
  email: string | null;
  avatar_url: string | null;
  unit_system: UnitSystem;
}

/**
 * Application request state, produced by the root `routes/_middleware.tsx` and
 * threaded to every route through the generated `$<file>.ts` helpers.
 */
export interface State {
  db: {
    query: QueryFn;
    transaction: <T>(fn: (query: QueryFn) => Promise<T>) => Promise<T>;
  };
  user: User | null;
  unitSystem: UnitSystem;
  shoppingListCount: number;
  householdId: string | null;
  pageTitle: string;
}

/** Escape special LIKE/ILIKE characters so user input is treated literally. */
export function escapeLike(s: string): string {
  return s.replace(/[%_\\]/g, (c) => `\\${c}`);
}

export function slugify(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
