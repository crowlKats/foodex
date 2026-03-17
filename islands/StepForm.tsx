import { useSignal } from "@preact/signals";
import TbArrowUp from "tb-icons/TbArrowUp";
import TbArrowDown from "tb-icons/TbArrowDown";
import TbPlus from "tb-icons/TbPlus";
import TbX from "tb-icons/TbX";
import TbUpload from "tb-icons/TbUpload";

interface MediaItem {
  id: string;
  url: string;
}

interface StepEntry {
  title: string;
  body: string;
  media: MediaItem[];
}

interface StepFormProps {
  initialSteps: StepEntry[];
}

export default function StepForm({ initialSteps }: StepFormProps) {
  const items = useSignal<StepEntry[]>(
    initialSteps.length > 0
      ? [...initialSteps]
      : [{ title: "", body: "", media: [] }],
  );
  const uploading = useSignal<number | null>(null);

  function add() {
    items.value = [...items.value, { title: "", body: "", media: [] }];
  }

  function remove(index: number) {
    items.value = items.value.filter((_, i) => i !== index);
  }

  function update(index: number, field: "title" | "body", value: string) {
    const next = [...items.value];
    next[index] = { ...next[index], [field]: value };
    items.value = next;
  }

  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= items.value.length) return;
    const next = [...items.value];
    [next[index], next[target]] = [next[target], next[index]];
    items.value = next;
  }

  async function uploadMedia(stepIndex: number, files: FileList | null) {
    if (!files || files.length === 0) return;
    uploading.value = stepIndex;

    const next = [...items.value];
    for (const file of Array.from(files)) {
      const form = new FormData();
      form.append("file", file);
      try {
        const res = await fetch("/api/upload", { method: "POST", body: form });
        if (!res.ok) continue;
        const data = await res.json();
        next[stepIndex] = {
          ...next[stepIndex],
          media: [...next[stepIndex].media, {
            id: String(data.id),
            url: String(data.url),
          }],
        };
      } catch {}
    }
    items.value = next;
    uploading.value = null;
  }

  function removeMedia(stepIndex: number, mediaIndex: number) {
    const next = [...items.value];
    const item = next[stepIndex];
    const mediaItem = item.media[mediaIndex];
    fetch(`/api/media/${mediaItem.id}`, { method: "DELETE" }).catch(() => {});
    next[stepIndex] = {
      ...item,
      media: item.media.filter((_, i) => i !== mediaIndex),
    };
    items.value = next;
  }

  return (
    <div class="space-y-4">
      {items.value.map((item, i) => (
        <div key={i} class="card p-3 space-y-2">
          <div class="flex gap-2 items-center">
            <span class="text-xs text-stone-400 font-mono">#{i + 1}</span>
            <input
              type="text"
              placeholder="Step title"
              value={item.title}
              onInput={(e) =>
                update(i, "title", (e.target as HTMLInputElement).value)}
              class="flex-1 text-sm font-medium"
            />
            <button
              type="button"
              onClick={() => move(i, -1)}
              disabled={i === 0}
              class="text-stone-400 hover:text-stone-600 disabled:opacity-30 px-1 cursor-pointer disabled:cursor-default"
            >
              <TbArrowUp class="size-4" />
            </button>
            <button
              type="button"
              onClick={() => move(i, 1)}
              disabled={i === items.value.length - 1}
              class="text-stone-400 hover:text-stone-600 disabled:opacity-30 px-1 cursor-pointer disabled:cursor-default"
            >
              <TbArrowDown class="size-4" />
            </button>
            <button
              type="button"
              onClick={() => remove(i)}
              class="text-red-600 hover:text-red-700 px-1 cursor-pointer"
            >
              <TbX class="size-4" />
            </button>
          </div>
          <textarea
            placeholder="Step body (markdown, use {{ ingredient_key }} for scaled amounts)"
            value={item.body}
            onInput={(e) =>
              update(i, "body", (e.target as HTMLTextAreaElement).value)}
            rows={6}
            class="w-full text-sm font-mono"
          />

          {item.media.length > 0 && (
            <div class="flex flex-wrap gap-2">
              {item.media.map((m, mi) => (
                <div key={m.id} class="relative group">
                  <img
                    src={m.url}
                    alt=""
                    class="w-20 h-20 object-cover border-2 border-stone-300 dark:border-stone-700"
                  />
                  <button
                    type="button"
                    onClick={() => removeMedia(i, mi)}
                    class="absolute top-0 right-0 bg-red-600 text-white w-5 h-5 text-xs opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                  >
                    <TbX class="size-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
          <button
            type="button"
            class="link text-xs"
            onClick={() => {
              const input = document.createElement("input");
              input.type = "file";
              input.accept = "image/*";
              input.multiple = true;
              input.onchange = () => uploadMedia(i, input.files);
              input.click();
            }}
          >
            {uploading.value === i ? "Uploading..." : (
              <span>
                <TbUpload class="size-3 inline mr-0.5" />Add images
              </span>
            )}
          </button>

          <input type="hidden" name={`steps[${i}][title]`} value={item.title} />
          <input type="hidden" name={`steps[${i}][body]`} value={item.body} />
          {item.media.map((m, mi) => (
            <input
              key={m.id}
              type="hidden"
              name={`steps[${i}][media][${mi}]`}
              value={m.id}
            />
          ))}
        </div>
      ))}
      <button
        type="button"
        onClick={add}
        class="link text-sm font-medium"
      >
        <TbPlus class="size-3.5 inline mr-1" />Add Step
      </button>
    </div>
  );
}
