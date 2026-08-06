import { useSignal } from "@preact/signals";
import { IconFileImport } from "@tabler/icons-preact";
import { IconLoader2 } from "@tabler/icons-preact";
import { IconX } from "@tabler/icons-preact";
import { Button } from "../components/Button.tsx";
import { Input, InputMultiline } from "../components/Input.tsx";
import { uploadImages } from "../lib/image-downscale.ts";

/**
 * The chatless import entry: paste a URL, recipe text, and/or photos. Submitting
 * seeds an assistant session with one import message and lands on the session's
 * editor view, where the extracted recipe fills in — no chat interaction needed.
 */
export default function ImportStart() {
  const url = useSignal("");
  const text = useSignal("");
  const context = useSignal("");
  const files = useSignal<{ file: File; preview: string }[]>([]);
  const dragging = useSignal(false);
  const submitting = useSignal(false);
  const error = useSignal<string | null>(null);

  function addFiles(newFiles: FileList | File[]) {
    const images = Array.from(newFiles).filter((f) =>
      f.type.startsWith("image/")
    );
    if (images.length === 0) return;
    files.value = [
      ...files.value,
      ...images.map((file) => ({ file, preview: URL.createObjectURL(file) })),
    ];
  }

  function removeFile(index: number) {
    URL.revokeObjectURL(files.value[index]?.preview ?? "");
    files.value = files.value.filter((_, i) => i !== index);
  }

  const hasInput = !!(url.value.trim() || text.value.trim() ||
    files.value.length > 0);

  async function submit() {
    if (!hasInput || submitting.value) return;
    submitting.value = true;
    error.value = null;
    try {
      const ids = await uploadImages(files.value.map((f) => f.file));

      const parts: string[] = [];
      if (url.value.trim()) {
        parts.push(`Import the recipe at this URL: ${url.value.trim()}`);
      }
      if (text.value.trim()) {
        parts.push(
          url.value.trim() || ids.length > 0
            ? `Recipe text:\n\n${text.value.trim()}`
            : `Import this recipe:\n\n${text.value.trim()}`,
        );
      }
      if (ids.length > 0 && !url.value.trim() && !text.value.trim()) {
        parts.push(
          ids.length > 1
            ? "Import the recipe from these photos."
            : "Import the recipe from this photo.",
        );
      }
      if (context.value.trim()) {
        parts.push(`Additional context: ${context.value.trim()}`);
      }

      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: { text: parts.join("\n\n"), images: ids },
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Import failed");
      globalThis.location.href = `/agent/${data.id}?start=1`;
    } catch (err) {
      error.value = (err as Error).message;
      submitting.value = false;
    }
  }

  if (submitting.value) {
    return (
      <div class="card">
        <div class="flex flex-col items-center justify-center py-12 gap-4">
          <IconLoader2 class="size-12 text-orange-600 animate-spin" />
          <p class="text-sm font-medium">Starting the import…</p>
          <p class="text-xs text-stone-500">
            You'll land in the editor while the recipe is extracted.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div class="space-y-4">
      {error.value && <div class="alert-error">{error.value}</div>}

      <div>
        <label class="block text-sm font-medium mb-1">Recipe URL</label>
        <Input
          type="url"
          class="w-full"
          placeholder="https://example.com/best-lasagna"
          value={url.value}
          onValueChange={(v) => url.value = v}
        />
      </div>

      <div>
        <label class="block text-sm font-medium mb-1">
          Photos{" "}
          <span class="text-stone-400">
            (cookbook pages, screenshots, handwritten cards)
          </span>
        </label>
        <div
          class={`card cursor-pointer transition-colors duration-75 ${
            dragging.value ? "border-orange-600 dark:border-orange-500" : ""
          }`}
          onDragOver={(e) => {
            e.preventDefault();
            dragging.value = true;
          }}
          onDragLeave={() => {
            dragging.value = false;
          }}
          onDrop={(e) => {
            e.preventDefault();
            dragging.value = false;
            if (e.dataTransfer?.files) addFiles(e.dataTransfer.files);
          }}
          onClick={() => {
            const input = document.createElement("input");
            input.type = "file";
            input.accept = "image/*";
            input.multiple = true;
            input.onchange = () => {
              if (input.files) addFiles(input.files);
            };
            input.click();
          }}
        >
          <div class="flex flex-col items-center justify-center py-6 gap-3">
            <IconFileImport
              class={`size-10 ${
                dragging.value ? "text-orange-600" : "text-stone-400"
              }`}
            />
            <p class="text-sm text-stone-500">
              Tap to select or take photos, or drag images here.
            </p>
          </div>
        </div>
        {files.value.length > 0 && (
          <div class="flex flex-wrap gap-1.5 mt-2">
            {files.value.map((f, i) => (
              <div key={f.preview} class="relative group">
                <img
                  src={f.preview}
                  alt=""
                  class="size-20 object-cover border-2 border-stone-200 dark:border-stone-700"
                />
                <button
                  type="button"
                  title="Remove image"
                  onClick={() =>
                    removeFile(i)}
                  class="absolute top-0 right-0 bg-red-600 text-white size-5 flex items-center justify-center cursor-pointer"
                >
                  <IconX class="size-3" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <label class="block text-sm font-medium mb-1">Recipe text</label>
        <InputMultiline
          rows={5}
          class="w-full"
          placeholder="Paste the recipe text here…"
          value={text.value}
          onValueChange={(v) => text.value = v}
        />
      </div>

      <div>
        <label class="block text-sm font-medium mb-1">
          Additional context <span class="text-stone-400">(optional)</span>
        </label>
        <Input
          type="text"
          class="w-full"
          placeholder="e.g. language, recipe name, number of servings…"
          value={context.value}
          onValueChange={(v) => context.value = v}
        />
      </div>

      <Button type="button" disabled={!hasInput} onClick={submit}>
        Import Recipe
      </Button>
    </div>
  );
}
