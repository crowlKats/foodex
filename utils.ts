import { createDefine } from "fresh";
import type { QueryFn } from "./db/mod.ts";
import type { UnitSystem } from "./lib/unit-display.ts";

export interface User {
  id: string;
  name: string;
  email: string | null;
  avatar_url: string | null;
  unit_system: UnitSystem;
}

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

export const define = createDefine<State>();

/** Escape special LIKE/ILIKE characters so user input is treated literally. */
export function escapeLike(s: string): string {
  return s.replace(/[%_\\]/g, (c) => `\\${c}`);
}
