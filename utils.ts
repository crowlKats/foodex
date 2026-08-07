import type { UnitSystem } from "./lib/unit-display.ts";

export interface User {
  id: string;
  name: string;
  email: string | null;
  avatar_url: string | null;
  unit_system: UnitSystem;
  /**
   * Set while an admin is sudoing: this User is the impersonated target and
   * `sudoBy` is the real admin. Everything acting on `user` sees the target;
   * auditing and admin gating look through to `sudoBy`.
   */
  sudoBy?: User;
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
