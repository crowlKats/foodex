import { useSignal } from "@preact/signals";
import { useEffect } from "preact/hooks";
import { IconFileImport } from "@tabler/icons-preact";
import { IconLoader2 } from "@tabler/icons-preact";
import { IconX } from "@tabler/icons-preact";
import { IconCheck } from "@tabler/icons-preact";
import { IconAlertTriangle } from "@tabler/icons-preact";
import { IconArrowMerge } from "@tabler/icons-preact";
import { IconScissors } from "@tabler/icons-preact";
import { IconChevronLeft } from "@tabler/icons-preact";
import { IconChevronRight } from "@tabler/icons-preact";
import { Button } from "../components/Button.tsx";
import { Input } from "../components/Input.tsx";
import { uploadImages } from "../lib/image-downscale.ts";
import { MAX_MESSAGE_IMAGES } from "../lib/agent/attachments.ts";

interface Photo {
  file: File;
  preview: string;
}

interface Group {
  /** Indices into the photo list (consecutive). */
  from: number;
  to: number;
  files: File[];
}

type GroupStatus =
  | "queued"
  | "uploading"
  | "extracting"
  | "ready"
  | "attention"
  | "failed";

const STATUS_LABEL: Record<GroupStatus, string> = {
  queued: "Waiting…",
  uploading: "Uploading photos…",
  extracting: "Extracting recipe…",
  ready: "Ready to review",
  attention: "Needs attention",
  failed: "Failed",
};

/** How many recipes extract at once. Turns are slow; two keeps the rate
 * limiter (30 messages/min) far away while roughly halving the wall clock. */
const CONCURRENCY = 2;

/**
 * Bulk import: photograph a whole recipe book, drop every page here, group
 * consecutive pages into recipes, and each group becomes its own assistant
 * import session — extracted in the background and listed for review.
 */
export default function BulkImport() {
  const photos = useSignal<Photo[]>([]);
  /** merged[i] — photo i belongs to the same recipe as the photo before it. */
  const merged = useSignal<boolean[]>([]);
  const context = useSignal("");
  const dragging = useSignal(false);
  const running = useSignal(false);
  const statuses = useSignal<GroupStatus[]>([]);
  const sessionIds = useSignal<(string | null)[]>([]);
  const started = useSignal(false);
  /** Index of the photo open in the large viewer, or null. */
  const viewer = useSignal<number | null>(null);

  // Arrow keys page through the photos while the viewer is open, so
  // neighbouring pages can be compared for the "same recipe?" call.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (viewer.value === null) return;
      if (e.key === "Escape") viewer.value = null;
      else if (e.key === "ArrowLeft" && viewer.value > 0) {
        viewer.value = viewer.value - 1;
      } else if (
        e.key === "ArrowRight" && viewer.value < photos.value.length - 1
      ) {
        viewer.value = viewer.value + 1;
      }
    }
    globalThis.addEventListener("keydown", onKey);
    return () => globalThis.removeEventListener("keydown", onKey);
  }, []);

  function addFiles(newFiles: FileList | File[]) {
    const images = Array.from(newFiles)
      .filter((f) => f.type.startsWith("image/"))
      .sort((a, b) =>
        a.name.localeCompare(b.name, undefined, {
          numeric: true,
        })
      );
    if (images.length === 0) return;
    photos.value = [
      ...photos.value,
      ...images.map((file) => ({ file, preview: URL.createObjectURL(file) })),
    ];
    merged.value = [...merged.value, ...images.map(() => false)];
  }

  function removePhoto(index: number) {
    URL.revokeObjectURL(photos.value[index]?.preview ?? "");
    photos.value = photos.value.filter((_, i) => i !== index);
    merged.value = merged.value.filter((_, i) => i !== index);
  }

  function toggleMerge(index: number) {
    merged.value = merged.value.map((m, i) => (i === index ? !m : m));
  }

  function groups(): Group[] {
    const out: Group[] = [];
    photos.value.forEach((p, i) => {
      if (i === 0 || !merged.value[i]) {
        out.push({ from: i, to: i, files: [p.file] });
      } else {
        const g = out[out.length - 1];
        g.to = i;
        g.files.push(p.file);
      }
    });
    return out;
  }

  const gs = groups();
  const oversized = gs.filter((g) => g.files.length > MAX_MESSAGE_IMAGES);

  // Leaving the page mid-run abandons the queue (finished sessions survive).
  if (typeof globalThis.addEventListener === "function") {
    globalThis.onbeforeunload = running.value ? () => "importing" : null;
  }

  function pageLabel(g: Group): string {
    return g.from === g.to
      ? `photo ${g.from + 1}`
      : `photos ${g.from + 1}–${g.to + 1}`;
  }

  function buildText(g: Group): string {
    const parts = [
      g.files.length > 1
        ? "Import the recipe from these photos."
        : "Import the recipe from this photo.",
      `(${pageLabel(g)} of a bulk book import)`,
    ];
    if (context.value.trim()) {
      parts.push(`Additional context: ${context.value.trim()}`);
    }
    return parts.join("\n");
  }

  function setStatus(i: number, s: GroupStatus) {
    statuses.value = statuses.value.map((v, j) => (j === i ? s : v));
  }

  /** Run one group's turn to completion by draining its SSE stream. */
  async function drainTurn(sessionId: string): Promise<void> {
    const res = await fetch(`/api/agent/${sessionId}/message`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "resume" }),
    });
    if (!res.ok || !res.body) throw new Error(`Turn failed (${res.status})`);
    const reader = res.body.getReader();
    while (!(await reader.read()).done) {
      // Progress events are irrelevant here — only completion matters.
    }
  }

  async function runOne(i: number, g: Group) {
    try {
      setStatus(i, "uploading");
      const ids = await uploadImages(g.files);
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: { text: buildText(g), images: ids } }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.id) throw new Error(data.error || "Session failed");
      sessionIds.value = sessionIds.value.map((v, j) =>
        j === i ? String(data.id) : v
      );
      setStatus(i, "extracting");
      await drainTurn(String(data.id));
      const state = await fetch(`/api/agent/${data.id}`).then((r) => r.json());
      const hasRecipe = (state.staging ?? []).some(
        (it: { kind: string }) =>
          it.kind === "create_recipe" || it.kind === "edit_recipe",
      );
      setStatus(i, hasRecipe ? "ready" : "attention");
    } catch {
      setStatus(i, "failed");
    }
  }

  async function importAll() {
    if (running.value || gs.length === 0 || oversized.length > 0) return;
    running.value = true;
    started.value = true;
    statuses.value = gs.map(() => "queued");
    sessionIds.value = gs.map(() => null);
    let next = 0;
    await Promise.all(
      Array.from({ length: Math.min(CONCURRENCY, gs.length) }, async () => {
        while (true) {
          const i = next++;
          if (i >= gs.length) return;
          await runOne(i, gs[i]);
        }
      }),
    );
    running.value = false;
  }

  return (
    <div class="space-y-4">
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
        <div class="flex flex-col items-center justify-center py-8 gap-3">
          <IconFileImport
            class={`size-12 ${
              dragging.value ? "text-orange-600" : "text-stone-400"
            }`}
          />
          <p class="text-sm text-stone-500">
            Drop every page photo here (or tap to select). Photos are ordered by
            filename.
          </p>
        </div>
      </div>

      {photos.value.length > 0 && (
        <>
          <div class="text-xs text-stone-500 dark:text-stone-400 space-y-1 text-pretty">
            <p>
              Each box below becomes ONE recipe. When a recipe spans several
              pages, use <IconArrowMerge class="size-3.5 inline" />{" "}
              on a photo to merge it into the previous box.
            </p>
          </div>

          <div class="space-y-3">
            {gs.map((g, gi) => (
              <div key={g.from} class="card p-3">
                <div class="flex items-center gap-2 mb-2 text-xs text-stone-500">
                  <span class="font-semibold uppercase tracking-wide">
                    Recipe {gi + 1}
                  </span>
                  <span>{pageLabel(g)}</span>
                  {g.files.length > MAX_MESSAGE_IMAGES && (
                    <span class="text-red-600 flex items-center gap-1">
                      <IconAlertTriangle class="size-3.5" />
                      max {MAX_MESSAGE_IMAGES} photos per recipe
                    </span>
                  )}
                </div>
                <div class="flex flex-wrap gap-2">
                  {photos.value.slice(g.from, g.to + 1).map((p, off) => {
                    const idx = g.from + off;
                    return (
                      <div key={p.preview} class="relative group">
                        <img
                          src={p.preview}
                          alt=""
                          class="size-24 object-cover border-2 border-stone-200 dark:border-stone-700 cursor-zoom-in"
                          onClick={() => viewer.value = idx}
                        />
                        <span class="absolute bottom-0 left-0 px-1 text-[0.625rem] bg-black/60 text-white">
                          {idx + 1}
                        </span>
                        {!running.value && (
                          <button
                            type="button"
                            title="Remove photo"
                            onClick={() => removePhoto(idx)}
                            class="absolute top-0 right-0 bg-red-600 text-white size-5 flex items-center justify-center cursor-pointer opacity-0 group-hover:opacity-100"
                          >
                            <IconX class="size-3" />
                          </button>
                        )}
                        {!running.value && idx > 0 && (
                          <button
                            type="button"
                            title={merged.value[idx]
                              ? "Split into its own recipe"
                              : "Merge into the previous recipe"}
                            onClick={() => toggleMerge(idx)}
                            class="absolute top-0 left-0 bg-stone-900/80 text-white size-5 flex items-center justify-center cursor-pointer opacity-0 group-hover:opacity-100"
                          >
                            {merged.value[idx]
                              ? <IconScissors class="size-3" />
                              : <IconArrowMerge class="size-3" />}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
                {started.value && statuses.value[gi] && (
                  <div class="flex items-center gap-2 mt-2 text-sm">
                    {statuses.value[gi] === "uploading" ||
                        statuses.value[gi] === "extracting"
                      ? (
                        <IconLoader2 class="size-4 animate-spin text-orange-600" />
                      )
                      : statuses.value[gi] === "ready"
                      ? <IconCheck class="size-4 text-green-600" />
                      : statuses.value[gi] === "queued"
                      ? null
                      : <IconAlertTriangle class="size-4 text-red-500" />}
                    <span
                      class={statuses.value[gi] === "ready"
                        ? "text-green-700 dark:text-green-500"
                        : "text-stone-500"}
                    >
                      {STATUS_LABEL[statuses.value[gi]]}
                    </span>
                    {sessionIds.value[gi] &&
                      (statuses.value[gi] === "ready" ||
                        statuses.value[gi] === "attention" ||
                        statuses.value[gi] === "failed") &&
                      (
                        <a
                          href={`/agent/${sessionIds.value[gi]}${
                            statuses.value[gi] === "ready" ? "" : "?start=1"
                          }`}
                          target="_blank"
                          class="link text-sm"
                        >
                          {statuses.value[gi] === "ready"
                            ? "Review →"
                            : "Open session →"}
                        </a>
                      )}
                  </div>
                )}
              </div>
            ))}
          </div>

          <div>
            <label class="block text-sm font-medium mb-1">
              Context for every recipe{" "}
              <span class="text-stone-400">(optional)</span>
            </label>
            <Input
              type="text"
              class="w-full"
              placeholder="e.g. hand-written German family recipe book"
              value={context.value}
              onValueChange={(v) => context.value = v}
              disabled={running.value}
            />
          </div>

          <Button
            type="button"
            disabled={running.value || gs.length === 0 || oversized.length > 0}
            onClick={importAll}
          >
            {running.value
              ? `Importing… (${
                statuses.value.filter((s) =>
                  s === "ready" || s === "attention" || s === "failed"
                ).length
              }/${gs.length})`
              : `Import ${gs.length} recipe${gs.length === 1 ? "" : "s"}`}
          </Button>
          {started.value && !running.value && (
            <p class="text-sm text-stone-500">
              Done. Review each recipe via the links above — every one is a
              regular assistant session, so you can also find them later under
              Assistant.
            </p>
          )}
        </>
      )}

      {viewer.value !== null && photos.value[viewer.value] && (() => {
        const idx = viewer.value;
        const gi = gs.findIndex((g) => idx >= g.from && idx <= g.to);
        return (
          <div
            class="fixed inset-0 z-50 flex flex-col bg-black/85"
            onClick={() => viewer.value = null}
          >
            <div
              class="shrink-0 flex items-center gap-3 px-4 py-2 text-sm text-white"
              onClick={(e) => e.stopPropagation()}
            >
              <span class="font-medium">
                Photo {idx + 1} of {photos.value.length}
              </span>
              <span class="text-white/70">Recipe {gi + 1}</span>
              {idx > 0 && !running.value && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  icon={merged.value[idx] ? IconScissors : IconArrowMerge}
                  onClick={() => toggleMerge(idx)}
                >
                  {merged.value[idx]
                    ? "Split into its own recipe"
                    : "Merge into previous recipe"}
                </Button>
              )}
              <button
                type="button"
                title="Close"
                class="ml-auto text-white/70 hover:text-white cursor-pointer"
                onClick={() => viewer.value = null}
              >
                <IconX class="size-6" />
              </button>
            </div>
            <div class="flex-1 min-h-0 flex items-center justify-center gap-2 px-2 pb-4">
              <button
                type="button"
                title="Previous photo"
                disabled={idx === 0}
                class="shrink-0 text-white/70 hover:text-white disabled:opacity-20 cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation();
                  if (idx > 0) viewer.value = idx - 1;
                }}
              >
                <IconChevronLeft class="size-10" />
              </button>
              <img
                src={photos.value[idx].preview}
                alt=""
                class="max-w-full max-h-full object-contain"
                onClick={(e) => e.stopPropagation()}
              />
              <button
                type="button"
                title="Next photo"
                disabled={idx === photos.value.length - 1}
                class="shrink-0 text-white/70 hover:text-white disabled:opacity-20 cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation();
                  if (idx < photos.value.length - 1) viewer.value = idx + 1;
                }}
              >
                <IconChevronRight class="size-10" />
              </button>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
