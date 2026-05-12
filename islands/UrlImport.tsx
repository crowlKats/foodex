import { useSignal } from "@preact/signals";
import TbLink from "tb-icons/TbLink";
import TbLoader2 from "tb-icons/TbLoader2";
import { Button } from "../components/Button.tsx";
import { Input } from "../components/Input.tsx";

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
        <Input
          type="url"
          placeholder="https://example.com/recipe/..."
          icon={TbLink}
          class="flex-1"
          value={url.value}
          onValueChange={(v) => {
            url.value = v;
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submit();
            }
          }}
        />
        <Button
          type="button"
          disabled={!url.value.trim()}
          onClick={submit}
        >
          Import
        </Button>
      </div>

      <p class="text-xs text-stone-500">
        Paste a recipe URL from any website — most recipe sites are supported.
      </p>
    </div>
  );
}
