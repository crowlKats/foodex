import { useSignal } from "@preact/signals";
import TbFileImport from "tb-icons/TbFileImport";
import TbLoader2 from "tb-icons/TbLoader2";
import TbX from "tb-icons/TbX";

interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

async function cropAndUpload(
  file: File,
  bounds: Bounds,
): Promise<string> {
  const img = new Image();
  const url = URL.createObjectURL(file);
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = reject;
    img.src = url;
  });
  URL.revokeObjectURL(url);

  const sx = Math.round(bounds.x * img.naturalWidth);
  const sy = Math.round(bounds.y * img.naturalHeight);
  const sw = Math.round(bounds.width * img.naturalWidth);
  const sh = Math.round(bounds.height * img.naturalHeight);

  const canvas = document.createElement("canvas");
  canvas.width = sw;
  canvas.height = sh;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);

  const blob = await new Promise<Blob>((resolve) =>
    canvas.toBlob((b) => resolve(b!), "image/jpeg", 0.9)
  );

  const form = new FormData();
  form.append("file", blob, "cover.jpg");
  const res = await fetch("/api/upload", { method: "POST", body: form });
  if (!res.ok) throw new Error("Upload failed");
  const data = await res.json();
  return String(data.id);
}

export default function OcrUpload() {
  const dragging = useSignal(false);
  const files = useSignal<File[]>([]);
  const processing = useSignal(false);
  const error = useSignal<string | null>(null);
  const context = useSignal("");
  function addFiles(newFiles: FileList | File[]) {
    const images = Array.from(newFiles).filter((f) =>
      f.type.startsWith("image/")
    );
    if (images.length === 0) return;
    files.value = [...files.value, ...images];
  }

  function removeFile(index: number) {
    files.value = files.value.filter((_, i) => i !== index);
  }

  async function submit() {
    if (files.value.length === 0) return;
    processing.value = true;
    error.value = null;

    const formData = new FormData();
    for (const f of files.value) {
      formData.append("image", f);
    }
    if (context.value.trim()) {
      formData.append("context", context.value.trim());
    }

    try {
      const res = await fetch("/api/ocr", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "OCR failed");
      }

      let coverId: string | null = null;
      if (data.cover_image) {
        try {
          coverId = await cropAndUpload(
            files.value[data.cover_image.image_index],
            data.cover_image,
          );
        } catch { /* crop failed, skip cover */ }
      }

      // Create draft and redirect to editor
      const draftRes = await fetch("/api/drafts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipe_data: data,
          ai_messages: [{ role: "assistant", content: JSON.stringify(data) }],
          cover_image_id: coverId ? parseInt(coverId) : null,
          source: "ocr",
        }),
      });
      const draft = await draftRes.json();
      globalThis.location.href = `/recipes/drafts/${draft.id}`;
    } catch (err) {
      error.value = (err as Error).message;
      processing.value = false;
    }
  }

  if (processing.value) {
    return (
      <div class="card">
        <div class="flex flex-col items-center justify-center py-12 gap-4">
          <TbLoader2 class="size-12 text-orange-600 animate-spin" />
          <p class="text-sm font-medium">
            Extracting recipe from {files.value.length}{" "}
            image{files.value.length > 1 ? "s" : ""}...
          </p>
          <p class="text-xs text-stone-500">This may take a few seconds.</p>
        </div>
      </div>
    );
  }

  return (
    <div class="space-y-4">
      {error.value && <div class="alert-error">{error.value}</div>}

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
          if (e.dataTransfer?.files) {
            addFiles(e.dataTransfer.files);
          }
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
        <div class="flex flex-col items-center justify-center py-8 gap-4">
          <TbFileImport
            class={`size-12 ${
              dragging.value ? "text-orange-600" : "text-stone-400"
            }`}
          />
          <p class="text-sm text-stone-500">
            Tap to select or take photos, or drag images here.
          </p>
        </div>
      </div>

      {files.value.length > 0 && (
        <div class="space-y-1">
          {files.value.map((f, i) => (
            <div
              key={`${f.name}-${i}`}
              class="flex items-center gap-2 text-sm"
            >
              <span class="truncate flex-1">{f.name}</span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  removeFile(i);
                }}
                class="text-red-600 hover:text-red-700 cursor-pointer"
              >
                <TbX class="size-4" />
              </button>
            </div>
          ))}
        </div>
      )}

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
        disabled={files.value.length === 0}
        onClick={submit}
      >
        Extract Recipe
      </button>
    </div>
  );
}
