import { createDefine } from "fresh";
import type { QueryFn } from "./db/mod.ts";

export interface User {
  id: number;
  name: string;
  email: string | null;
  avatar_url: string | null;
}

export interface State {
  db: {
    query: QueryFn;
    transaction: <T>(fn: (query: QueryFn) => Promise<T>) => Promise<T>;
  };
  user: User | null;
  shoppingListCount: number;
  householdId: number | null;
  pageTitle: string;
}

export const define = createDefine<State>();

/** Escape special LIKE/ILIKE characters so user input is treated literally. */
export function escapeLike(s: string): string {
  return s.replace(/[%_\\]/g, (c) => `\\${c}`);
}
