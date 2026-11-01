import type { ComponentChildren, JSX } from "preact";
import { createContext } from "preact";
import { useContext } from "preact/hooks";
import type {
  MessageFormat,
  MessageMarkupPart,
  MessagePart,
} from "messageformat";

declare global {
  var __LOCALE__: string | undefined;
}

// deno-lint-ignore no-explicit-any
export type Messages = Record<string, any>;

export interface Bundle<M extends Messages = Messages> {
  get<K extends keyof M>(key: K): MessageFormat;
}

type Bundles<M extends Messages = Messages> = Record<string, Bundle<M>>;

// Helper to check if args are required (not Record<string, never>)
type ArgsRequired<T> = T extends Record<string, never> ? false : true;

// Helper for t function overloads
type TFunction<M extends Messages> = {
  <K extends keyof M & string>(
    key: K,
    ...args: ArgsRequired<M[K]> extends true
      ? [values: M[K], markupElements?: MarkupElements]
      : [values?: M[K], markupElements?: MarkupElements]
  ): JSX.Element;
  use(): <K extends keyof M & string>(
    key: K,
    ...args: ArgsRequired<M[K]> extends true ? [values: M[K]] : [values?: M[K]]
  ) => string;
};

type MarkupElements = Record<
  string,
  (props: {
    children?: ComponentChildren;
    options?: Record<string, unknown>;
  }) => ComponentChildren
>;

const defaultMarkupElements: MarkupElements = {
  bold: ({ children }) => <b>{children}</b>,
  italic: ({ children }) => <i>{children}</i>,
};

const LocaleContext = createContext<string | null>(null);

export function LocaleProvider(
  { locale, children }: { locale: string; children: ComponentChildren },
): JSX.Element {
  return (
    <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>
  );
}

export function useLocale(): string {
  const contextLocale = useContext(LocaleContext);
  return contextLocale ?? globalThis.__LOCALE__ ?? "en";
}

export function createT<M extends Messages>(
  bundles: Bundles<M>,
): TFunction<M> {
  function t(
    key: string,
    values?: Record<string, unknown>,
    markupElements?: MarkupElements,
  ): JSX.Element {
    return (
      <Message
        bundles={bundles}
        messageKey={key}
        values={values}
        markupElements={markupElements}
      />
    );
  }

  t.use = function use() {
    const locale = useLocale();
    const bundle = bundles[locale];
    if (!bundle) {
      throw new Error(`No bundle for locale: ${locale}`);
    }
    return (key: string, values?: Record<string, unknown>) => {
      const mf = bundle.get(key);
      return mf.format(values);
    };
  };

  return t as TFunction<M>;
}

function Message({
  bundles,
  messageKey,
  values,
  markupElements,
}: {
  bundles: Bundles;
  messageKey: string;
  values?: Record<string, unknown>;
  markupElements?: MarkupElements;
}): JSX.Element {
  const locale = useLocale();
  const bundle = bundles[locale];
  if (!bundle) {
    throw new Error(`No bundle for locale: ${locale}`);
  }

  const mf = bundle.get(messageKey);
  const parts = mf.formatToParts(values);
  const { children } = processPartsRange(parts, 0, null, {
    ...defaultMarkupElements,
    ...markupElements,
  });

  return <>{children}</>;
}

function isMarkupPart(part: MessagePart<string>): part is MessageMarkupPart {
  return part.type === "markup";
}

function processPartsRange(
  parts: MessagePart<string>[],
  startIndex: number,
  closeTag: string | null,
  markupElements: MarkupElements,
): { children: ComponentChildren; endIndex: number } {
  const result: ComponentChildren[] = [];
  let i = startIndex;

  while (i < parts.length) {
    const part = parts[i];

    // Check for closing tag
    if (
      closeTag && isMarkupPart(part) && part.kind === "close" &&
      part.name === closeTag
    ) {
      break;
    }

    if (isMarkupPart(part)) {
      if (part.kind === "standalone") {
        const element = markupElements[part.name];
        if (element) {
          result.push(element({ options: part.options }));
        }
      } else if (part.kind === "open") {
        const nested = processPartsRange(
          parts,
          i + 1,
          part.name,
          markupElements,
        );
        const element = markupElements[part.name];
        if (element) {
          result.push(
            element({ children: nested.children, options: part.options }),
          );
        } else {
          result.push(nested.children);
        }
        i = nested.endIndex;
      }
      // Skip close tags (handled above or orphaned)
      i++;
      continue;
    }

    if (part.type === "bidiIsolation") {
      i++;
      continue;
    }

    if ("value" in part && part.value !== undefined) {
      result.push(String(part.value));
    }
    i++;
  }

  return {
    children: result.length === 1 ? result[0] : result,
    endIndex: i,
  };
}
