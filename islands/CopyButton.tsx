import TbShare from "tb-icons/TbShare";
import TbCheck from "tb-icons/TbCheck";
import { signal } from "@preact/signals";
import { Button } from "../components/Button.tsx";

interface CopyButtonProps {
  text: string;
}

export default function CopyButton({ text }: CopyButtonProps) {
  const copied = signal(false);

  return (
    <Button
      type="button"
      variant="outline"
      icon={copied.value ? TbCheck : TbShare}
      onClick={() => {
        navigator.clipboard.writeText(text);
        copied.value = true;
        setTimeout(() => (copied.value = false), 2000);
      }}
    >
      {copied.value ? "Copied!" : "Share"}
    </Button>
  );
}
