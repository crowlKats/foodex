import { useSignal } from "@preact/signals";
import { useEffect } from "preact/hooks";
import { IconLoader2, IconPhoto, IconX } from "@tabler/icons-preact";
import { Button } from "../components/Button.tsx";
import DictateButton from "./DictateButton.tsx";
import { InputMultiline } from "../components/Input.tsx";
import { uploadImages } from "../lib/image-downscale.ts";
import { sharedImportText, takeIncomingShare } from "../lib/share-target.ts";

const PLACEHOLDER = [
  "Paste a link to import from…",
  "",
  "…or write the recipe out, dictate it, or attach photos of a page. Add " +
  "instructions too: halve the sugar, it's in Italian, serves 4.",
].join("\n");

/**
 * The single entry point for adding a recipe: one box that takes a link, the
 * recipe text, photos, instructions, or any mix of them. Submitting seeds an
 * assistant session with that message and lands on the session, where the
 * recipe is extracted and staged for review.
 *
 * `initialText` is the URL/text from a GET share (or the query-string echo
 * of a POST share). Shared photos arrive via the service worker stash.
 */
export default function RecipeStart(
  { initialText = "" }: { initialText?: string },
) {
  const text = useSignal(initialText);
  const files = useSignal<{ file: File; preview: string }[]>([]);
  const dragging = useSignal(false);
  const submitting = useSignal(false);
  const error = useSignal<string | null>(null);

  function addFiles(newFiles: FileList | File[]) {
    const images = Array.from(newFiles).filter((f) =>
      !f.type || f.type.startsWith("image/")
    );
    if (images.length === 0) return;
    files.value = [
      ...files.value,
      ...images.map((file) => ({ file, preview: URL.createObjectURL(file) })),
    ];
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const shared = await takeIncomingShare();
      if (cancelled || !shared) return;
      const incoming = sharedImportText(shared);
      // Don't clobber a URL that already landed via query params, or text
      // the user has started editing, unless the stash has a fuller paste.
      if (
        incoming &&
        (!text.value.trim() ||
          (text.value === initialText &&
            incoming.length > text.value.trim().length))
      ) {
        text.value = incoming;
      }
      if (shared.files.length > 0) addFiles(shared.files);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // A transcript joins whatever is already in the box as its own paragraph.
  function addTranscript(transcript: string) {
    const current = text.value.trimEnd();
    text.value = current ? `${current}\n\n${transcript}` : transcript;
  }

  function removeFile(index: number) {
    URL.revokeObjectURL(files.value[index]?.preview ?? "");
    files.value = files.value.filter((_, i) => i !== index);
  }

  function pickFiles() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.multiple = true;
    input.onchange = () => {
      if (input.files) addFiles(input.files);
    };
    input.click();
  }

  const hasInput = !!(text.value.trim() || files.value.length > 0);

  async function submit() {
    if (!hasInput || submitting.value) return;
    submitting.value = true;
    error.value = null;
    try {
      const ids = await uploadImages(files.value.map((f) => f.file));
      // Photos alone carry no instruction, so say what to do with them; with
      // text the user's own wording is the instruction and is left untouched.
      const message = text.value.trim() ||
        (ids.length > 1
          ? "Add the recipe from these photos to the library."
          : "Add the recipe from this photo to the library.");

      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: { text: message, images: ids } }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not start");
      globalThis.location.href = `/agent/${data.id}?start=1`;
    } catch (err) {
      error.value = (err as Error).message;
      submitting.value = false;
    }
  }

  if (submitting.value) {
    return (
      <div class="flex flex-col items-center justify-center py-12 gap-4">
        <IconLoader2 class="size-12 text-orange-600 animate-spin" />
        <p class="text-sm font-medium">Getting started…</p>
        <p class="text-xs text-stone-500">
          The assistant is reading what you gave it.
        </p>
      </div>
    );
  }

  // The textarea brings its own border, so the drop zone is bare: a card
  // around it would only draw a second box inside the first.
  return (
    <div
      class="space-y-3"
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
    >
      {error.value && <div class="alert-error">{error.value}</div>}

      <InputMultiline
        autofocus
        rows={8}
        class={`w-full ${
          dragging.value ? "border-orange-600! dark:border-orange-500!" : ""
        }`}
        placeholder={PLACEHOLDER}
        value={text.value}
        onValueChange={(v) => text.value = v}
        onPaste={(e) => {
          const images = Array.from(e.clipboardData?.files ?? []);
          if (images.length > 0) {
            e.preventDefault();
            addFiles(images);
          }
        }}
      />

      {files.value.length > 0 && (
        <div class="flex flex-wrap gap-1.5">
          {files.value.map((f, i) => (
            <div key={f.preview} class="relative">
              <img
                src={f.preview}
                alt=""
                class="size-20 object-cover border-2 border-stone-200 dark:border-stone-700"
              />
              <button
                type="button"
                title="Remove image"
                onClick={() => removeFile(i)}
                class="absolute top-0 right-0 bg-red-600 text-white size-5 flex items-center justify-center cursor-pointer"
              >
                <IconX class="size-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div class="flex items-center justify-between gap-3">
        <div class="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            icon={IconPhoto}
            onClick={pickFiles}
            class="whitespace-nowrap"
          >
            Attach photos
          </Button>
          <DictateButton
            label="Dictate"
            onTranscript={addTranscript}
            onError={(msg) => error.value = msg || null}
          />
        </div>
        <Button
          type="button"
          disabled={!hasInput}
          onClick={submit}
          class="whitespace-nowrap"
        >
          Continue
        </Button>
      </div>
    </div>
  );
}
