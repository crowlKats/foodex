import { IconShare } from "@tabler/icons-preact";
import { IconCheck } from "@tabler/icons-preact";
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
        // User dismissed the share sheet, or the share failed; nothing to do.
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
      icon={copied.value ? IconCheck : IconShare}
      onClick={handleClick}
    >
      {copied.value ? "Copied!" : "Share"}
    </Button>
  );
}
