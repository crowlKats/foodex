import { createContext } from "preact";
import { useContext } from "preact/hooks";
import type { ComponentChildren } from "preact";
import { catalogFor, catalogs, type Messages } from "./mod.ts";

const I18nContext = createContext<Messages>(catalogs.en);

export function I18nProvider(
  { locale, children }: { locale: string; children: ComponentChildren },
) {
  return (
    <I18nContext.Provider value={catalogFor(locale)}>
      {children}
    </I18nContext.Provider>
  );
}

/** Messages for the current provider locale. Pages under the layout use this. */
export function useMessages(): Messages {
  return useContext(I18nContext);
}
