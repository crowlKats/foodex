import { useSignal } from "@preact/signals";
import TbLoader2 from "tb-icons/TbLoader2";
import TbSend from "tb-icons/TbSend";
import TbBrain from "tb-icons/TbBrain";
import TbX from "tb-icons/TbX";
import type { OcrRecipeData } from "../lib/ocr.ts";

export interface AiMessage {
  role: "user" | "assistant";
  content: string;
  thinking?: string;
}

interface Props {
  draftId: string;
  initialHistory: AiMessage[];
  onRecipeUpdate: (recipe: OcrRecipeData) => void;
  onHistoryUpdate: (messages: AiMessage[]) => void;
}

export default function RefineInput(
  { draftId, initialHistory, onRecipeUpdate, onHistoryUpdate }: Props,
) {
  const instruction = useSignal("");
  const refining = useSignal(false);
  const error = useSignal<string | null>(null);
  const history = useSignal<AiMessage[]>(initialHistory);
  const viewingThinking = useSignal<string | null>(null);

  async function refine() {
    const text = instruction.value.trim();
    if (!text) return;
    refining.value = true;
    error.value = null;

    // Build messages for API (without thinking field)
    const apiMessages = [
      ...history.value.map((m) => ({ role: m.role, content: m.content })),
      { role: "user" as const, content: text },
    ];

    try {
      const res = await fetch("/api/refine-recipe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: apiMessages }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Refinement failed");
      }

      const updatedHistory: AiMessage[] = [
        ...history.value,
        { role: "user", content: text },
        {
          role: "assistant",
          content: JSON.stringify(data.recipe),
          thinking: data.thinking ?? undefined,
        },
      ];

      // Persist to draft
      await fetch(`/api/drafts/${draftId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipe_data: data.recipe,
          ai_messages: updatedHistory,
          ai_thinking: data.thinking,
        }),
      });

      history.value = updatedHistory;
      onHistoryUpdate(updatedHistory);
      onRecipeUpdate(data.recipe as OcrRecipeData);
      instruction.value = "";
    } catch (err) {
      error.value = (err as Error).message;
    } finally {
      refining.value = false;
    }
  }

  // Pair user messages with their assistant responses
  const exchanges: { user: string; thinking?: string }[] = [];
  const msgs = history.value;
  for (let i = 0; i < msgs.length; i++) {
    if (msgs[i].role === "user") {
      const assistant = msgs[i + 1];
      exchanges.push({
        user: msgs[i].content,
        thinking: assistant?.thinking,
      });
    }
  }
  // Include initial assistant thinking (from generate/ocr) if present
  const initialThinking = msgs.length > 0 && msgs[0].role === "assistant"
    ? msgs[0].thinking
    : undefined;

  return (
    <div class="card mb-4 space-y-2">
      <label class="block text-sm font-medium">Refine with AI</label>

      {(exchanges.length > 0 || initialThinking) && (
        <div class="max-h-40 overflow-y-auto space-y-1 text-xs border-2 border-stone-200 dark:border-stone-700 rounded p-2">
          {initialThinking && (
            <div class="flex items-center gap-1 text-stone-400">
              <button
                type="button"
                class="hover:text-orange-600 cursor-pointer"
                onClick={() => {
                  viewingThinking.value = initialThinking;
                }}
                title="View AI thinking"
              >
                <TbBrain class="size-3" />
              </button>
              <span class="italic">Initial generation</span>
            </div>
          )}
          {exchanges.map((ex, i) => (
            <div key={i} class="flex items-start gap-1 text-stone-500">
              {ex.thinking && (
                <button
                  type="button"
                  class="text-stone-400 hover:text-orange-600 cursor-pointer mt-0.5 shrink-0"
                  onClick={() => {
                    viewingThinking.value = ex.thinking!;
                  }}
                  title="View AI thinking"
                >
                  <TbBrain class="size-3" />
                </button>
              )}
              {!ex.thinking && <span class="w-3 shrink-0" />}
              <span>
                <span class="text-stone-400">You:</span> {ex.user}
              </span>
            </div>
          ))}
        </div>
      )}

      {error.value && <div class="alert-error text-sm">{error.value}</div>}

      <div class="flex gap-2">
        <input
          type="text"
          placeholder="e.g. make it vegetarian, simplify the steps, reduce to 2 servings..."
          class="flex-1"
          value={instruction.value}
          disabled={refining.value}
          onInput={(e) => {
            instruction.value = (e.target as HTMLInputElement).value;
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              refine();
            }
          }}
        />
        <button
          type="button"
          class="btn btn-outline"
          disabled={refining.value || !instruction.value.trim()}
          onClick={refine}
        >
          {refining.value
            ? <TbLoader2 class="size-4 animate-spin" />
            : <TbSend class="size-4" />}
        </button>
      </div>

      {viewingThinking.value && (
        <div
          class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
          onClick={() => {
            viewingThinking.value = null;
          }}
        >
          <div
            class="bg-white dark:bg-stone-900 rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div class="flex items-center justify-between px-4 py-3 border-b border-stone-200 dark:border-stone-700">
              <h3 class="font-semibold flex items-center gap-2">
                <TbBrain class="size-5" />
                AI Thinking
              </h3>
              <button
                type="button"
                class="text-stone-400 hover:text-stone-600 dark:hover:text-stone-300 cursor-pointer"
                onClick={() => {
                  viewingThinking.value = null;
                }}
              >
                <TbX class="size-5" />
              </button>
            </div>
            <div class="overflow-y-auto p-4">
              <pre class="text-sm text-stone-600 dark:text-stone-400 whitespace-pre-wrap font-mono">{viewingThinking.value}</pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
