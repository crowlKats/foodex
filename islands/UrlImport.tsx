import { useSignal } from "@preact/signals";
import TbLink from "tb-icons/TbLink";
import TbLoader2 from "tb-icons/TbLoader2";

export default function UrlImport() {
  const url = useSignal("");
  const loading = useSignal(false);
  const error = useSignal<string | null>(null);

  async function submit() {
    const trimmed = url.value.trim();
    if (!trimmed) return;

    loading.value = true;
    error.value = null;

    try {
      const res = await fetch("/api/import-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Import failed");

      const draftRes = await fetch("/api/drafts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipe_data: data,
          source: "url",
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
          <p class="text-sm font-medium">Importing recipe from URL...</p>
        </div>
      </div>
    );
  }

  return (
    <div class="space-y-3">
      {error.value && <div class="alert-error">{error.value}</div>}

      <div class="flex gap-2">
        <div class="relative flex-1">
          <TbLink class="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-stone-400" />
          <input
            type="url"
            placeholder="https://example.com/recipe/..."
            class="w-full pl-9"
            value={url.value}
            onInput={(e) => {
              url.value = (e.target as HTMLInputElement).value;
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                submit();
              }
            }}
          />
        </div>
        <button
          type="button"
          class="btn btn-primary"
          disabled={!url.value.trim()}
          onClick={submit}
        >
          Import
        </button>
      </div>

      <p class="text-xs text-stone-500">
        Paste a recipe URL from any website — most recipe sites are supported.
      </p>
    </div>
  );
}
