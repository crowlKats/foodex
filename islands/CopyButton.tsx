import TbShare from "tb-icons/TbShare";
import TbCheck from "tb-icons/TbCheck";
import { signal } from "@preact/signals";

interface CopyButtonProps {
  text: string;
}

export default function CopyButton({ text }: CopyButtonProps) {
  const copied = signal(false);

  return (
    <button
      type="button"
      class="btn btn-outline"
      onClick={() => {
        navigator.clipboard.writeText(text);
        copied.value = true;
        setTimeout(() => (copied.value = false), 2000);
      }}
    >
      {copied.value
        ? (
          <>
            <TbCheck class="size-3.5" />Copied!
          </>
        )
        : (
          <>
            <TbShare class="size-3.5" />Share
          </>
        )}
    </button>
  );
}
