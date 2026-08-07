import { slugify } from "../utils.ts";
import type { QueryFn } from "../db/mod.ts";

/**
 * Derive a free recipe slug from a title, suffixing `-2`, `-3`, … past any
 * existing recipe. Every path that inserts or renames a recipe must use this;
 * a duplicate title is a normal event (another household's version of the
 * same dish), never an error.
 */
export async function uniqueSlug(
  q: QueryFn,
  title: string,
  excludeId?: string,
): Promise<string> {
  const base = slugify(title || "") || "recipe";
  let slug = base;
  let suffix = 1;
  while (true) {
    const existing = await q<{ id: string }>(
      excludeId
        ? "SELECT id FROM recipes WHERE slug = $1 AND id != $2"
        : "SELECT id FROM recipes WHERE slug = $1",
      excludeId ? [slug, excludeId] : [slug],
    );
    if (existing.rows.length === 0) return slug;
    suffix++;
    slug = `${base}-${suffix}`;
  }
}
