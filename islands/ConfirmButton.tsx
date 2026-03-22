import type { ComponentChildren } from "preact";

interface ConfirmButtonProps {
  message: string;
  class?: string;
  children?: ComponentChildren;
  onClick?: () => void;
}

export default function ConfirmButton(
  { message, class: className, children, onClick }: ConfirmButtonProps,
) {
  return (
    <button
      type={onClick ? "button" : "submit"}
      class={className}
      onClick={(e) => {
        if (!confirm(message)) {
          e.preventDefault();
          return;
        }
        if (onClick) onClick();
      }}
    >
      {children}
    </button>
  );
}
