import { assert, assertEquals } from "@std/assert";
import type { QueryFn } from "../db/mod.ts";
import { mediaIsReadable } from "./media-access.ts";

const KEY = "uploads/11111111-1111-1111-1111-111111111111.webp";
const HOUSEHOLD = "22222222-2222-2222-2222-222222222222";

function fakeDb(rows: unknown[]): {
  query: QueryFn;
  calls: { text: string; params?: unknown[] }[];
} {
  const calls: { text: string; params?: unknown[] }[] = [];
  const query = ((text: string, params?: unknown[]) => {
    calls.push({ text, params });
    return Promise.resolve({ rows });
  }) as QueryFn;
  return { query, calls };
}

Deno.test("mediaIsReadable: no media row is not readable", async () => {
  const db = fakeDb([]);
  assertEquals(await mediaIsReadable(db, KEY, HOUSEHOLD), false);
  assertEquals(db.calls[0].params, [KEY, HOUSEHOLD]);
});

Deno.test("mediaIsReadable: a matching row is readable", async () => {
  const db = fakeDb([{}]);
  assertEquals(await mediaIsReadable(db, KEY, HOUSEHOLD), true);
});

Deno.test("mediaIsReadable: anonymous callers still go through the row check", async () => {
  const db = fakeDb([]);
  assertEquals(await mediaIsReadable(db, KEY, null), false);
  assertEquals(db.calls[0].params, [KEY, null]);
});

Deno.test("mediaIsReadable: query requires a media row and visibility", () => {
  const db = fakeDb([]);
  mediaIsReadable(db, KEY, HOUSEHOLD);
  const sql = db.calls[0].text;
  assert(sql.includes("FROM media m"));
  assert(sql.includes("m.household_id = $2"));
  assert(sql.includes("private = false OR r.household_id = $2"));
  assert(sql.includes("recipe_step_media"));
  assert(sql.includes("collection_shares"));
});
