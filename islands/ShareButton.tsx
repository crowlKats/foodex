import TbShare from "tb-icons/TbShare";
import TbCheck from "tb-icons/TbCheck";
import { useSignal } from "@preact/signals";
import { Button } from "../components/Button.tsx";

interface ShareButtonProps {
  url: string;
  title?: string;
}

export default function ShareButton({ url, title }: ShareButtonProps) {
  const copied = useSignal(false);

  async function handleClick() {
    if (navigator.share) {
      try {
        await navigator.share({ title, url });
      } catch {
        // User dismissed the share sheet, or the share failed — nothing to do.
      }
      return;
    }
    await navigator.clipboard.writeText(url);
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
