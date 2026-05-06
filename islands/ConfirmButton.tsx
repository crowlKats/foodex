import type { ComponentChildren, JSX } from "preact";
import {
  Button,
  type ButtonSize,
  type ButtonVariant,
} from "../components/Button.tsx";

interface ConfirmButtonProps {
  message: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  class?: string;
  children: ComponentChildren;
  onClick?: () => void;
}

export default function ConfirmButton(
  { message, variant, size, class: extra, children, onClick }:
    ConfirmButtonProps,
) {
  const handleClick: JSX.MouseEventHandler<HTMLButtonElement> = (e) => {
    if (!confirm(message)) {
      e.preventDefault();
      return;
    }
    if (onClick) onClick();
  };

  if (onClick) {
    return (
      <Button
        type="button"
        variant={variant}
        size={size}
        class={extra}
        onClick={handleClick}
      >
        {children}
      </Button>
    );
  }
  return (
    <Button
      type="submit"
      variant={variant}
      size={size}
      class={extra}
      onClick={handleClick}
    >
      {children}
    </Button>
  );
}
