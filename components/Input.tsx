import type { ComponentChildren, JSX } from "preact";
import type { IconComponent } from "./Button.tsx";
import { onInputFactory } from "../islands/components/input.ts";
import { cva, cx, type VariantProps } from "class-variance-authority";

const input = cva("", {
  defaultVariants: {
    size: "md",
    monospace: false,
  },
  variants: {
    size: {
      md: "",
      sm: "text-sm",
      xs: "text-xs",
    },
    monospace: {
      true: "font-mono",
      false: "",
    },
  },
});

type InputAttrs = Omit<JSX.IntrinsicElements["input"], "class" | "size">;

export interface InputProps extends InputAttrs, VariantProps<typeof input> {
  class?: string;
  icon?: IconComponent;
  onValueChange?: (value: string) => void;
}

export function Input(props: InputProps) {
  const {
    size,
    monospace,
    class: class_,
    icon: Icon,
    onValueChange,
    onInput,
    ...rest
  } = props;
  const inputClass = input({
    size,
    monospace,
    class: Icon ? undefined : class_,
  });

  const handleInput = onInputFactory(onInput, onValueChange);

  if (Icon) {
    return (
      <div class={cx("relative", class_)}>
        <Icon
          class="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-stone-400 pointer-events-none"
          aria-hidden
        />
        <input
          class={cx(inputClass, "w-full pl-9")}
          onInput={handleInput}
          onChange={handleInput}
          {...rest}
        />
      </div>
    );
  }
  return <input class={inputClass} onInput={handleInput} {...rest} />;
}

type TextareaAttrs = Omit<JSX.IntrinsicElements["textarea"], "class" | "rows">;

export interface InputMultilineProps
  extends TextareaAttrs, VariantProps<typeof input> {
  class?: string;
  onValueChange?: (value: string) => void;
}

export function InputMultiline(props: InputMultilineProps) {
  const {
    class: class_,
    size,
    monospace,
    onValueChange,
    onInput,
    ...rest
  } = props;
  const textareaClass = input({ size, monospace, class: class_ });

  const handleInput = onInputFactory(onInput, onValueChange);

  return (
    <textarea
      class={textareaClass}
      onInput={handleInput}
      onChange={handleInput}
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
  const cls = cx(
    "flex min-w-0",
    "[&>:first-child]:flex-1 [&>:first-child]:min-w-0",
    "[&>:not(:first-child)]:shrink-0 [&>:not(:first-child)]:-ml-0.5",
    extra,
  );
  return <div class={cls}>{children}</div>;
}
