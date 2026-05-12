import type { ComponentChildren, JSX } from "preact";
import type { IconComponent } from "./Button.tsx";

export type InputSize = "xs" | "sm" | "md";

const SIZE_CLASS: Record<InputSize, string> = {
  md: "",
  sm: "text-sm",
  xs: "text-xs",
};

type InputAttrs = Omit<
  JSX.IntrinsicElements["input"],
  "class" | "size" | "onInput" | "onChange"
>;

export interface InputProps extends InputAttrs {
  class?: string;
  size?: InputSize;
  icon?: IconComponent;
  monospace?: boolean;
  onValueChange?: (value: string) => void;
  onInput?: JSX.GenericEventHandler<HTMLInputElement>;
  onChange?: JSX.GenericEventHandler<HTMLInputElement>;
}

export function Input(props: InputProps) {
  const {
    class: extra,
    size = "md",
    icon: Icon,
    monospace,
    onValueChange,
    onInput,
    onChange,
    ...rest
  } = props;

  const handleInput: JSX.GenericEventHandler<HTMLInputElement> = (e) => {
    if (onValueChange) onValueChange(e.currentTarget.value);
    if (onInput) onInput(e);
  };

  const sizeClass = SIZE_CLASS[size];
  const monoClass = monospace ? "font-mono" : "";

  if (Icon) {
    const wrapperClass = ["relative", extra].filter((c) => c).join(" ");
    const inputClass = ["w-full pl-9", sizeClass, monoClass]
      .filter((c) => c).join(" ");
    return (
      <div class={wrapperClass}>
        <Icon class="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-stone-400 pointer-events-none" />
        <input
          class={inputClass}
          onInput={handleInput}
          onChange={onChange}
          {...rest}
        />
      </div>
    );
  }
  const inputClass = [extra, sizeClass, monoClass]
    .filter((c) => c).join(" ") || undefined;
  return (
    <input
      class={inputClass}
      onInput={handleInput}
      onChange={onChange}
      {...rest}
    />
  );
}

type TextareaAttrs = Omit<
  JSX.IntrinsicElements["textarea"],
  "class" | "rows" | "onInput" | "onChange"
>;

export interface InputMultilineProps extends TextareaAttrs {
  class?: string;
  size?: InputSize;
  rows?: number;
  monospace?: boolean;
  onValueChange?: (value: string) => void;
  onInput?: JSX.GenericEventHandler<HTMLTextAreaElement>;
  onChange?: JSX.GenericEventHandler<HTMLTextAreaElement>;
}

export function InputMultiline(props: InputMultilineProps) {
  const {
    class: extra,
    size = "md",
    rows = 2,
    monospace,
    onValueChange,
    onInput,
    onChange,
    ...rest
  } = props;

  const handleInput: JSX.GenericEventHandler<HTMLTextAreaElement> = (e) => {
    if (onValueChange) onValueChange(e.currentTarget.value);
    if (onInput) onInput(e);
  };

  const className = [extra, SIZE_CLASS[size], monospace ? "font-mono" : null]
    .filter((c) => c).join(" ") || undefined;
  return (
    <textarea
      rows={rows}
      class={className}
      onInput={handleInput}
      onChange={onChange}
      {...rest}
    />
  );
}

export interface InputBarProps {
  class?: string;
  children: ComponentChildren;
}

/**
 * Joins multiple inputs/selects into a single visual unit. The first child
 * grows to fill available space; subsequent children sit flush against it
 * with a 0.5px overlap so the borders share an edge.
 */
export function InputBar({ class: extra, children }: InputBarProps) {
  const cls = [
    "flex min-w-0",
    "[&>:first-child]:flex-1 [&>:first-child]:min-w-0",
    "[&>:not(:first-child)]:shrink-0 [&>:not(:first-child)]:-ml-0.5",
    extra,
  ].filter((c) => c).join(" ");
  return <div class={cls}>{children}</div>;
}
