import { useSignal } from "@preact/signals";
import TbLoader2 from "tb-icons/TbLoader2";

export default function TextImport() {
  const text = useSignal("");
  const context = useSignal("");
  const loading = useSignal(false);
  const error = useSignal<string | null>(null);

  async function submit() {
    const trimmed = text.value.trim();
    if (trimmed.length < 20) return;

    loading.value = true;
    error.value = null;

    try {
      const res = await fetch("/api/import-text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: trimmed,
          context: context.value.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Import failed");

      const draftRes = await fetch("/api/drafts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipe_data: data,
          ai_messages: [{ role: "assistant", content: JSON.stringify(data) }],
          source: "text",
        }),
      });
      const draft = await draftRes.json();
      globalThis.location.href = `/recipes/drafts/${draft.id}`;
    } catch (err) {
      error.value = (err as Error).message;
      loading.value = false;
    }
  }

  if (loading.value) {
    return (
      <div class="card">
        <div class="flex flex-col items-center justify-center py-12 gap-4">
          <TbLoader2 class="size-12 text-orange-600 animate-spin" />
          <p class="text-sm font-medium">Extracting recipe from text...</p>
          <p class="text-xs text-stone-500">This may take a few seconds.</p>
        </div>
      </div>
    );
  }

  return (
    <div class="space-y-3">
      {error.value && <div class="alert-error">{error.value}</div>}

      <textarea
        placeholder="Paste recipe text here..."
        rows={8}
        class="w-full text-sm font-mono"
        value={text.value}
        onInput={(e) => {
          text.value = (e.target as HTMLTextAreaElement).value;
        }}
      />

      <textarea
        placeholder="Additional context (e.g. language, recipe name, number of servings...)"
        rows={2}
        class="w-full text-sm"
        value={context.value}
        onInput={(e) => {
          context.value = (e.target as HTMLTextAreaElement).value;
        }}
      />

      <button
        type="button"
        class="btn btn-primary"
        disabled={text.value.trim().length < 20}
        onClick={submit}
      >
        Extract Recipe
      </button>

      <p class="text-xs text-stone-500">
        Paste a recipe from anywhere — email, document, message, etc. AI will
        parse it into structured form.
      </p>
    </div>
  );
}
