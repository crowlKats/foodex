import type { ComponentChildren, JSX, VNode } from "preact";

export type ButtonVariant =
  | "primary"
  | "danger"
  | "danger-outline"
  | "outline"
  | "ghost"
  | "danger-ghost";
export type ButtonSize = "xs" | "sm" | "md";
export type IconComponent = (props: { class: string }) => VNode | null;

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary: "btn-primary",
  danger: "btn-danger",
  "danger-outline":
    "text-red-600 border-red-300 hover:bg-red-50 dark:hover:bg-red-950",
  outline: "btn-outline",
  ghost: "",
  "danger-ghost": "",
};

const SIZE_CLASS: Record<ButtonSize, string> = {
  md: "",
  sm: "py-1 px-2",
  xs: "text-xs py-0.5 px-2",
};

const GHOST_BASE =
  "inline-flex items-center justify-center p-1 cursor-pointer transition-colors";
const GHOST_TONE: Record<"ghost" | "danger-ghost", string> = {
  ghost:
    "text-stone-400 hover:text-stone-700 dark:text-stone-500 dark:hover:text-stone-200",
  "danger-ghost":
    "text-stone-400 hover:text-red-500 dark:text-stone-500 dark:hover:text-red-400",
};

function buttonClass(
  variant: ButtonVariant,
  size: ButtonSize,
  extra: string | undefined,
): string {
  if (variant === "ghost" || variant === "danger-ghost") {
    return [GHOST_BASE, GHOST_TONE[variant], extra].filter((s) => s).join(" ");
  }
  return ["btn", VARIANT_CLASS[variant], SIZE_CLASS[size], extra]
    .filter((s) => s)
    .join(" ");
}

interface StyleProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  class?: string;
}

type ContentProps =
  | { children: ComponentChildren; icon?: IconComponent; title?: string }
  | { icon: IconComponent; title: string; children?: never };

function renderContent(
  { icon: Icon, children }: {
    icon?: IconComponent;
    children?: ComponentChildren;
  },
) {
  return (
    <>
      {Icon && <Icon class="size-4" />}
      {children}
    </>
  );
}

type ButtonAttrs = Omit<
  JSX.IntrinsicElements["button"],
  "type" | "onClick" | "class" | "children" | "title"
>;

type ButtonClickProps = ButtonAttrs & StyleProps & ContentProps & {
  type: "button";
  onClick: JSX.MouseEventHandler<HTMLButtonElement>;
};

type ButtonSubmitProps = ButtonAttrs & StyleProps & ContentProps & {
  type: "submit" | "reset";
  onClick?: JSX.MouseEventHandler<HTMLButtonElement>;
};

export type ButtonProps = ButtonClickProps | ButtonSubmitProps;

export function Button(props: ButtonProps) {
  const {
    variant = "primary",
    size = "md",
    class: extra,
    children,
    icon,
    title,
    type,
    onClick,
    ...rest
  } = props;
  return (
    <button
      type={type}
      onClick={onClick}
      class={buttonClass(variant, size, extra)}
      title={title}
      aria-label={children == null ? title : undefined}
      {...rest}
    >
      {renderContent({ icon, children })}
    </button>
  );
}

type AnchorAttrs = Omit<
  JSX.IntrinsicElements["a"],
  "href" | "class" | "children" | "title"
>;

export type ButtonLinkProps = AnchorAttrs & StyleProps & ContentProps & {
  href: string;
};

export function ButtonLink(props: ButtonLinkProps) {
  const {
    href,
    variant = "primary",
    size = "md",
    class: extra,
    children,
    icon,
    title,
    ...rest
  } = props;
  return (
    <a
      href={href}
      class={buttonClass(variant, size, extra)}
      title={title}
      aria-label={children == null ? title : undefined}
      {...rest}
    >
      {renderContent({ icon, children })}
    </a>
  );
}
