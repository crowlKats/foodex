import { useSignal } from "@preact/signals";
import { IconBrain } from "@tabler/icons-preact";
import { IconX } from "@tabler/icons-preact";
import { Button } from "../components/Button.tsx";

interface Props {
  thinking: string;
}

export default function ThinkingToggle({ thinking }: Props) {
  const open = useSignal(false);

  return (
    <>
      <button
        type="button"
        class="text-xs text-stone-400 hover:text-stone-600 dark:hover:text-stone-300 flex items-center gap-1 cursor-pointer"
        onClick={() => {
          open.value = !open.value;
        }}
      >
        <IconBrain class="size-3.5" />
        {open.value ? "Hide" : "Show"} AI thinking
      </button>
      {open.value && (
        <div
          class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
          onClick={() => {
            open.value = false;
          }}
        >
          <div
            class="bg-white dark:bg-stone-900 rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div class="flex items-center justify-between px-4 py-3 border-b border-stone-200 dark:border-stone-700">
              <h3 class="font-semibold flex items-center gap-2">
                <IconBrain class="size-5" />
                AI Thinking
              </h3>
              <Button
                type="button"
                variant="ghost"
                icon={IconX}
                title="Close"
                onClick={() => {
                  open.value = false;
                }}
              />
            </div>
            <div class="overflow-y-auto p-4">
              <pre class="text-sm text-stone-600 dark:text-stone-400 whitespace-pre-wrap font-mono">{thinking}</pre>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
