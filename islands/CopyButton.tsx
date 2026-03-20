import TbCopy from "tb-icons/TbCopy";
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
      class="text-stone-500 hover:text-stone-700 p-1"
      title="Copy"
      onClick={() => {
        navigator.clipboard.writeText(text);
        copied.value = true;
        setTimeout(() => (copied.value = false), 2000);
      }}
    >
      {copied.value ? <TbCheck class="size-4" /> : <TbCopy class="size-4" />}
    </button>
  );
}
