/**
 * Shared UI chrome catalog: common buttons, form labels, errors, language
 * names, and other strings used from more than one page or component.
 *
 * Page-specific copy lives next to that page as `Foo.en.mfr` / `Foo.it.mfr`.
 * Nav, admin tabs, and docs chrome have their own component catalogs.
 */
import { createT } from "../components/Translation.tsx";
import en from "./shared.en.mfr";
import it from "./shared.it.mfr";

export const t = createT({ en, it });
export { en, it };
