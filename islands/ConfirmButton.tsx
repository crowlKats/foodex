import type { ComponentChildren } from "preact";

interface ConfirmButtonProps {
  message: string;
  class?: string;
  children?: ComponentChildren;
}

export default function ConfirmButton(
  { message, class: className, children }: ConfirmButtonProps,
) {
  return (
    <button
      type="submit"
      class={className}
      onClick={(e) => {
        if (!confirm(message)) e.preventDefault();
      }}
    >
      {children}
    </button>
  );
}
