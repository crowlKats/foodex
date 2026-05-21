import TbShare from "tb-icons/TbShare";
import TbCheck from "tb-icons/TbCheck";
import { useSignal } from "@preact/signals";
import { Button } from "../components/Button.tsx";

interface ShareButtonProps {
  text: string;
  title?: string;
}

export default function ShareButton({ text, title }: ShareButtonProps) {
  const copied = useSignal(false);

  async function handleClick() {
    if (navigator.share) {
      try {
        await navigator.share({ title, url: text });
      } catch {
        // User dismissed the share sheet, or the share failed — nothing to do.
      }
      return;
    }
    await navigator.clipboard.writeText(text);
    copied.value = true;
    setTimeout(() => (copied.value = false), 2000);
  }

  return (
    <Button
      type="button"
      variant="outline"
      icon={copied.value ? TbCheck : TbShare}
      onClick={handleClick}
    >
      {copied.value ? "Copied!" : "Share"}
    </Button>
  );
}
