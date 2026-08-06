import { IconCheck } from "@tabler/icons-preact";
import type { ComponentChildren, JSX } from "preact";

type InputAttrs = Omit<
  JSX.IntrinsicElements["input"],
  "class" | "type" | "size"
>;

export interface CheckboxProps extends InputAttrs {
  label?: ComponentChildren;
  /** Extra classes for the wrapping label. */
  class?: string;
  /** Classes for the label text (defaults to `text-sm`). */
  labelClass?: string;
  title?: string;
}

/**
 * App-styled checkbox: the native input stays (form semantics, keyboard,
 * a11y) but is visually replaced by a sharp-cornered box that fills orange
 * when checked — matching the border-2 look of every other control. Styles
 * live under `.checkbox` in styles.css.
 */
export function Checkbox(
  { label, class: extra, labelClass, title, ...rest }: CheckboxProps,
) {
  return (
    <label class={["checkbox", extra].filter(Boolean).join(" ")} title={title}>
      <input type="checkbox" {...rest} />
      <span class="checkbox-box">
        <IconCheck class="size-3" stroke-width={4} />
      </span>
      {label != null && <span class={labelClass ?? "text-sm"}>{label}</span>}
    </label>
  );
}
