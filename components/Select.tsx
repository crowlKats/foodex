import type { JSX } from "preact";
import type { InputSize } from "./Input.tsx";

const SIZE_CLASS: Record<InputSize, string> = {
  md: "",
  sm: "text-sm",
  xs: "text-xs",
};

type SelectAttrs = Omit<
  JSX.IntrinsicElements["select"],
  "class" | "size" | "onChange"
>;

export interface SelectProps extends SelectAttrs {
  class?: string;
  size?: InputSize;
  onValueChange?: (value: string) => void;
  onChange?: JSX.GenericEventHandler<HTMLSelectElement>;
}

export function Select(props: SelectProps) {
  const {
    class: extra,
    size = "md",
    onValueChange,
    onChange,
    children,
    ...rest
  } = props;

  // See Input.tsx: emit no handler for a static (non-island) `<Select>`.
  const handleChange: JSX.GenericEventHandler<HTMLSelectElement> | undefined =
    onValueChange || onChange
      ? (e) => {
        if (onValueChange) onValueChange(e.currentTarget.value);
        if (onChange) onChange(e);
      }
      : undefined;

  const className = [extra, SIZE_CLASS[size]].filter((c) => c).join(" ") ||
    undefined;
  return (
    <select class={className} onChange={handleChange} {...rest}>
      {children}
    </select>
  );
}
