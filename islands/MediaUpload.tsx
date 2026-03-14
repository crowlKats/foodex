import { useSignal } from "@preact/signals";
import TbUpload from "tb-icons/TbUpload";
import TbX from "tb-icons/TbX";
import ImageCrop from "./ImageCrop.tsx";

interface MediaItem {
  id: string;
  url: string;
  filename: string;
  content_type: string;
}

interface MediaUploadProps {
  name: string;
  accept?: string;
  multiple?: boolean;
  initialMedia?: MediaItem[];
}

export default function MediaUpload(
  { name, accept = "image/*,video/*", multiple = false, initialMedia }:
    MediaUploadProps,
) {
  const items = useSignal<MediaItem[]>(initialMedia ?? []);
  const uploading = useSignal(false);
  const dragOver = useSignal(false);

  async function upload(files: FileList | null) {
    if (!files || files.length === 0) return;
    uploading.value = true;

    for (const file of Array.from(files)) {
      const form = new FormData();
      form.append("file", file);

      try {
        const res = await fetch("/api/upload", { method: "POST", body: form });
        if (!res.ok) continue;
        const data = await res.json();
        const newItem: MediaItem = {
          id: String(data.id),
          url: String(data.url),
          filename: String(data.filename),
          content_type: file.type,
        };
        if (multiple) {
          items.value = [...items.value, newItem];
        } else {
          items.value = [newItem];
        }
      } catch {
        // Upload failed silently
      }
    }

    uploading.value = false;
  }

  async function remove(index: number) {
    const item = items.value[index];
    try {
      await fetch(`/api/media/${item.id}`, { method: "DELETE" });
    } catch {
      // Ignore delete errors
    }
    items.value = items.value.filter((_, i) => i !== index);
  }

  function isImage(type: string) {
    return type.startsWith("image/");
  }

  return (
    <div>
      {items.value.length > 0 && (
        <div class="flex flex-wrap gap-2 mb-3">
          {items.value.map((item, i) => (
            <div
              key={item.id}
              class="relative group border-1.5 border-stone-300 dark:border-stone-600"
            >
              {isImage(item.content_type)
                ? (
                  <img
                    src={item.url}
                    alt={item.filename}
                    class="w-24 h-24 object-cover"
                  />
                )
                : (
                  <div class="w-24 h-24 flex items-center justify-center bg-stone-100 dark:bg-stone-800">
                    <span class="text-xs text-stone-500 text-center px-1 truncate">
                      {item.filename}
                    </span>
                  </div>
                )}
              <button
                type="button"
                onClick={() => remove(i)}
                class="absolute top-0 right-0 bg-red-600 text-white w-5 h-5 text-xs opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
              >
                <TbX class="size-3" />
              </button>
              {isImage(item.content_type) && (
                <div class="absolute bottom-0 left-0 right-0 opacity-0 group-hover:opacity-100 transition-opacity">
                  <ImageCrop
                    imageUrl={item.url}
                    mediaId={item.id}
                    onCropped={(newId, newUrl) => {
                      const next = [...items.value];
                      next[i] = {
                        ...next[i],
                        id: newId,
                        url: newUrl,
                      };
                      items.value = next;
                    }}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div
        class={`border-2 border-dashed p-4 text-center text-stone-500 text-sm cursor-pointer transition-colors ${
          dragOver.value
            ? "border-orange-500 bg-orange-50 dark:bg-orange-950"
            : "border-stone-300 dark:border-stone-600 hover:border-orange-400 hover:text-orange-400"
        }`}
        onDragOver={(e) => {
          e.preventDefault();
          dragOver.value = true;
        }}
        onDragLeave={() => {
          dragOver.value = false;
        }}
        onDrop={(e) => {
          e.preventDefault();
          dragOver.value = false;
          upload(e.dataTransfer?.files ?? null);
        }}
        onClick={() => {
          const input = document.createElement("input");
          input.type = "file";
          input.accept = accept;
          input.multiple = multiple;
          input.onchange = () => upload(input.files);
          input.click();
        }}
      >
        {uploading.value ? <span>Uploading...</span> : (
          <span>
            <TbUpload class="size-5 mx-auto mb-1" />
            Drop files here or click to upload
          </span>
        )}
      </div>

      {/* Hidden fields for form submission */}
      {items.value.map((item, i) => (
        <input
          key={item.id}
          type="hidden"
          name={multiple ? `${name}[${i}]` : name}
          value={item.id}
        />
      ))}
    </div>
  );
}
