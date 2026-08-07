import { useSignal } from "@preact/signals";
import { useEffect, useRef } from "preact/hooks";
import { IconSparkles } from "@tabler/icons-preact";
import { IconLoader2 } from "@tabler/icons-preact";
import { Button } from "../components/Button.tsx";
import { InputMultiline } from "../components/Input.tsx";

interface Props {
  recipeSlug: string;
  recipeTitle: string;
}

/**
 * "Ask AI" from the recipe edit view: seeds an assistant session about this
 * recipe and lands in its workbench, where the proposed edit shows up in the
 * familiar editor. The session reads the SAVED recipe, hence the hint.
 */
export default function AskAssistant({ recipeSlug, recipeTitle }: Props) {
  const open = useSignal(false);
  const text = useSignal("");
  const busy = useSignal(false);
  const error = useSignal<string | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open.value) return;
    const onDown = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) open.value = false;
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open.value]);

  async function ask() {
    const q = text.value.trim();
    if (!q || busy.value) return;
    busy.value = true;
    error.value = null;
    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: {
            text:
              `About the recipe [${recipeTitle}](/recipes/${recipeSlug}): ${q}`,
          },
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Couldn't start the session");
      globalThis.location.href = `/agent/${data.id}?start=1`;
    } catch (err) {
      error.value = (err as Error).message;
      busy.value = false;
    }
  }

  return (
    <div class="relative" ref={boxRef}>
      <Button
        type="button"
        variant="outline"
        icon={IconSparkles}
        onClick={() => {
          open.value = !open.value;
        }}
      >
        Ask AI
      </Button>
      {open.value && (
        <div class="absolute right-0 top-full mt-2 z-40 w-80 max-w-[90vw] bg-white dark:bg-stone-900 border-2 border-stone-300 dark:border-stone-700 p-3 space-y-2 shadow-lg">
          <InputMultiline
            rows={3}
            class="w-full"
            placeholder={`e.g. make this vegetarian, halve the sugar, add a section for the sauce…`}
            value={text.value}
            onValueChange={(v) => text.value = v}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                ask();
              }
            }}
          />
          <p class="text-xs text-stone-400 text-pretty">
            Opens an assistant session on this recipe. It sees the last saved
            version, so save your edits first if they matter.
          </p>
          {error.value && <div class="alert-error text-xs">{error.value}</div>}
          <Button
            type="button"
            size="sm"
            disabled={!text.value.trim() || busy.value}
            onClick={ask}
          >
            {busy.value
              ? <IconLoader2 class="size-4 animate-spin" />
              : "Ask the assistant"}
          </Button>
        </div>
      )}
    </div>
  );
}
