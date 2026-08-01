import type { ComponentChildren, JSX, MouseEventHandler } from "preact";
import { cva, type VariantProps } from "class-variance-authority";

/**
 * Icons are decorative: the accessible name comes from the button's text or
 * its `title`, never from the icon. Implementations must forward
 * `aria-hidden` to the rendered element so the icon stays out of the
 * accessibility tree.
 */
export type IconComponent = (props: {
  class: string;
  "aria-hidden"?: boolean;
}) => ComponentChildren;

/**
 * Disabled styling. `<a>` can't be `:disabled`, so `aria-disabled` is matched
 * too. Pointer events are off so hover styles can't kick in on a disabled
 * button; the `title` attribute won't surface in that state either — we
 * surface the reason inline near the button (see DraftEditor's "N errors"
 * indicator). Spelled out rather than generated: Tailwind only scans for
 * literal class names.
 */
const DISABLED =
  "disabled:opacity-50 disabled:cursor-not-allowed disabled:grayscale-[0.6] disabled:pointer-events-none aria-disabled:opacity-50 aria-disabled:cursor-not-allowed aria-disabled:grayscale-[0.6] aria-disabled:pointer-events-none";

const SOLID_BASE = `inline-flex items-center justify-center gap-1.5 font-semibold border-2 cursor-pointer transition-all duration-75 select-none ${DISABLED}`;

const GHOST_BASE =
  "inline-flex items-center justify-center p-1 cursor-pointer transition-colors";

/** Variants built on `SOLID_BASE`, i.e. everything but the ghosts. */
const SOLID = ["primary", "danger", "danger-outline", "outline"] as const;

const button = cva("", {
  defaultVariants: {
    variant: "primary",
    size: "md",
  },
  variants: {
    variant: {
      primary: `${SOLID_BASE} bg-orange-600 text-white border-orange-600 hover:bg-orange-700 hover:border-orange-700`,
      danger: `${SOLID_BASE} bg-red-600 text-white border-red-600 hover:bg-red-700 hover:border-red-700`,
      "danger-outline": `${SOLID_BASE} text-red-600 border-red-300 hover:bg-red-50 dark:hover:bg-red-950`,
      outline: `${SOLID_BASE} bg-transparent text-orange-600 border-orange-600 hover:bg-orange-600 hover:text-white dark:text-orange-400 dark:border-orange-400 dark:hover:bg-orange-500 dark:hover:text-stone-900`,
      ghost: `${GHOST_BASE} text-stone-400 hover:text-stone-700 dark:text-stone-500 dark:hover:text-stone-200`,
      "danger-ghost": `${GHOST_BASE} text-stone-400 hover:text-red-500 dark:text-stone-500 dark:hover:text-red-400`,
    },
    // Padding and text size live in compoundVariants: they only apply to the
    // solid variants (the ghosts carry their own `p-1` and inherit text size),
    // and emitting a class per size here would collide with those.
    size: {
      md: "",
      sm: "",
      xs: "",
    },
  },
  compoundVariants: [
    { variant: [...SOLID], size: "md", class: "px-5 py-2 text-sm" },
    { variant: [...SOLID], size: "sm", class: "px-2 py-1 text-sm" },
    { variant: [...SOLID], size: "xs", class: "px-2 py-0.5 text-xs" },
  ],
});

export type ButtonVariant = NonNullable<VariantProps<typeof button>["variant"]>;
export type ButtonSize = NonNullable<VariantProps<typeof button>["size"]>;

type StyleProps = VariantProps<typeof button> & {
  class?: string;
};

type ContentProps =
  | { children: ComponentChildren; icon?: IconComponent; title?: string }
  | { icon: IconComponent; title: string; children?: never };

type ButtonAttrs = Omit<
  JSX.IntrinsicElements["button"],
  "type" | "onClick" | "class" | "children" | "title"
>;

type ButtonClickProps = ButtonAttrs &
  StyleProps &
  ContentProps & {
    type: "button";
    onClick: MouseEventHandler<HTMLButtonElement>;
  };

type ButtonSubmitProps = ButtonAttrs &
  StyleProps &
  ContentProps & {
    type: "submit" | "reset";
    onClick?: MouseEventHandler<HTMLButtonElement>;
  };

export type ButtonProps = ButtonClickProps | ButtonSubmitProps;

export function Button(props: ButtonProps) {
  const {
    variant,
    size,
    class: class_,
    children,
    icon: Icon,
    title,
    ...rest
  } = props;
  return (
    <button
      class={button({ variant, size, class: class_ })}
      aria-label={children == null ? title : undefined}
      title={title}
      {...rest}
    >
      {Icon && <Icon class="size-4" aria-hidden />}
      {children}
    </button>
  );
}

type AnchorAttrs = Omit<
  JSX.IntrinsicElements["a"],
  "href" | "class" | "children" | "title"
>;

export type ButtonLinkProps = AnchorAttrs &
  StyleProps &
  ContentProps & {
    href: string;
  };

export function ButtonLink(props: ButtonLinkProps) {
  const {
    variant,
    size,
    class: class_,
    children,
    icon: Icon,
    title,
    ...rest
  } = props;
  return (
    <a
      class={button({ variant, size, class: class_ })}
      aria-label={children == null ? title : undefined}
      title={title}
      {...rest}
    >
      {Icon && <Icon class="size-4" aria-hidden />}
      {children}
    </a>
  );
}
