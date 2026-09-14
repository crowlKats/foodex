import { IconCheck, IconCopy } from "@tabler/icons-preact";
import { useSignal } from "@preact/signals";
import { Button, type ButtonSize } from "../components/Button.tsx";

interface CopyButtonProps {
  /** What lands on the clipboard. */
  text: string;
  size?: ButtonSize;
}

/** Copies a value to the clipboard and says so for a moment. */
export default function CopyButton({ text, size }: CopyButtonProps) {
  const copied = useSignal(false);

  async function handleClick() {
    await navigator.clipboard.writeText(text);
    copied.value = true;
    setTimeout(() => (copied.value = false), 2000);
  }

  return (
    <Button
      type="button"
      variant="outline"
      size={size}
      icon={copied.value ? IconCheck : IconCopy}
      onClick={handleClick}
    >
      {copied.value ? "Copied" : "Copy"}
    </Button>
  );
}
