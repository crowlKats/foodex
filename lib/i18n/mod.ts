/**
 * UI catalogs compiled from `.mfr` files by the Vite plugin.
 *
 * Pages import this module (or the `.mfr` files directly). The catalogs are
 * not parsed at runtime; Vite turns each resource into formatter functions
 * backed by the MF2 `MessageFormat` class.
 */

import { AsyncLocalStorage } from "node:async_hooks";
// @ts-types="../../locales/en.mfr.d.ts"
import en from "../../locales/en.mfr";
// @ts-types="../../locales/it.mfr.d.ts"
import it from "../../locales/it.mfr";
import { DEFAULT_LOCALE, type Locale, negotiateLocale } from "./locale.ts";

export type Messages = typeof en;

function isFormatter(value: unknown): value is (params?: object) => string {
  return typeof value === "function";
}

/** Overlay `over` onto `base`, keeping English formatters for missing keys. */
export function mergeMessages(base: Messages, over: unknown): Messages {
  function merge(a: unknown, b: unknown): unknown {
    if (isFormatter(a)) return isFormatter(b) ? b : a;
    if (a && typeof a === "object") {
      const out: Record<string, unknown> = {};
      const aa = a as Record<string, unknown>;
      const bb = (b && typeof b === "object")
        ? b as Record<string, unknown>
        : {};
      for (const key of Object.keys(aa)) {
        out[key] = merge(aa[key], bb[key]);
      }
      return out;
    }
    return b ?? a;
  }
  return merge(base, over) as Messages;
}

export const catalogs: Record<Locale, Messages> = {
  en,
  it: mergeMessages(en, it),
};

const localeStore = new AsyncLocalStorage<string>();

/** Run `fn` with `locale` as the request locale (SSR islands, handlers). */
export function withLocale<T>(locale: string, fn: () => T): T {
  return localeStore.run(locale, fn);
}

export function currentLocale(): string {
  if (typeof document !== "undefined") {
    const lang = document.documentElement.lang;
    if (lang) return negotiateLocale(lang);
  }
  return localeStore.getStore() ?? DEFAULT_LOCALE;
}

/** Pick the compiled catalog for a BCP 47 tag (or the current request). */
export function catalogFor(locale: string = currentLocale()): Messages {
  return catalogs[negotiateLocale(locale)];
}

export { en, it };
export {
  DEFAULT_LOCALE,
  isLocale,
  type Locale,
  negotiateLocale,
  SUPPORTED_LOCALES,
} from "./locale.ts";

/** Look up a meal-type / dietary / difficulty tag in the catalog. */
export function tagLabel(m: Messages, tag: string): string {
  const key = tag.replace(/-([a-z])/g, (_unused, c: string) => c.toUpperCase());
  const fn = (m.tags as Record<string, (() => string) | undefined>)[key];
  return fn ? fn() : tag;
}
