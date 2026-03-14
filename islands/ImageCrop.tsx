import { useEffect, useRef } from "preact/hooks";
import { useSignal } from "@preact/signals";
import TbCrop from "tb-icons/TbCrop";
import TbCheck from "tb-icons/TbCheck";
import TbX from "tb-icons/TbX";

interface ImageCropProps {
  imageUrl: string;
  mediaId: string;
  onCropped: (newId: string, newUrl: string) => void;
}

interface CropRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export default function ImageCrop(
  { imageUrl, mediaId, onCropped }: ImageCropProps,
) {
  const open = useSignal(false);
  const saving = useSignal(false);
  const imgRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const crop = useSignal<CropRect>({ x: 0.1, y: 0.1, w: 0.8, h: 0.8 });
  const dragging = useSignal<
    | null
    | "move"
    | "nw"
    | "ne"
    | "sw"
    | "se"
  >(null);
  const dragStart = useSignal({ mx: 0, my: 0, crop: crop.value });

  function getImageRect(): DOMRect | null {
    return imgRef.current?.getBoundingClientRect() ?? null;
  }

  function toFrac(clientX: number, clientY: number) {
    const rect = getImageRect();
    if (!rect) return { fx: 0, fy: 0 };
    return {
      fx: Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)),
      fy: Math.max(0, Math.min(1, (clientY - rect.top) / rect.height)),
    };
  }

  function onPointerDown(
    e: PointerEvent,
    mode: "move" | "nw" | "ne" | "sw" | "se",
  ) {
    e.preventDefault();
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragging.value = mode;
    const { fx, fy } = toFrac(e.clientX, e.clientY);
    dragStart.value = { mx: fx, my: fy, crop: { ...crop.value } };
  }

  function onPointerMove(e: PointerEvent) {
    if (!dragging.value) return;
    e.preventDefault();
    const { fx, fy } = toFrac(e.clientX, e.clientY);
    const dx = fx - dragStart.value.mx;
    const dy = fy - dragStart.value.my;
    const c = dragStart.value.crop;

    if (dragging.value === "move") {
      let nx = c.x + dx;
      let ny = c.y + dy;
      nx = Math.max(0, Math.min(1 - c.w, nx));
      ny = Math.max(0, Math.min(1 - c.h, ny));
      crop.value = { ...c, x: nx, y: ny };
    } else {
      let { x, y, w, h } = c;
      if (dragging.value.includes("w")) {
        const newX = Math.max(0, Math.min(x + w - 0.05, c.x + dx));
        w = w + (x - newX);
        x = newX;
      }
      if (dragging.value.includes("e")) {
        w = Math.max(0.05, Math.min(1 - x, c.w + dx));
      }
      if (dragging.value.startsWith("n")) {
        const newY = Math.max(0, Math.min(y + h - 0.05, c.y + dy));
        h = h + (y - newY);
        y = newY;
      }
      if (dragging.value.startsWith("s")) {
        h = Math.max(0.05, Math.min(1 - y, c.h + dy));
      }
      crop.value = { x, y, w, h };
    }
  }

  function onPointerUp() {
    dragging.value = null;
  }

  function onNewCrop(e: PointerEvent) {
    if (dragging.value) return;
    const { fx, fy } = toFrac(e.clientX, e.clientY);
    crop.value = { x: fx, y: fy, w: 0.05, h: 0.05 };
    onPointerDown(e, "se");
  }

  // Reset crop when opening
  useEffect(() => {
    if (open.value) {
      crop.value = { x: 0, y: 0, w: 1, h: 1 };
    }
  }, [open.value]);

  async function applyCrop() {
    saving.value = true;
    try {
      const img = new Image();
      img.crossOrigin = "anonymous";
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = reject;
        img.src = imageUrl;
      });

      const c = crop.value;
      const sx = Math.round(c.x * img.naturalWidth);
      const sy = Math.round(c.y * img.naturalHeight);
      const sw = Math.round(c.w * img.naturalWidth);
      const sh = Math.round(c.h * img.naturalHeight);

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

      // Delete old media
      fetch(`/api/media/${mediaId}`, { method: "DELETE" }).catch(() => {});

      onCropped(String(data.id), String(data.url));
      open.value = false;
    } finally {
      saving.value = false;
    }
  }

  if (!open.value) {
    return (
      <button
        type="button"
        class="link text-xs"
        onClick={() => {
          open.value = true;
        }}
      >
        <TbCrop class="size-3 inline mr-0.5" />Crop
      </button>
    );
  }

  const c = crop.value;

  return (
    <div class="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
      <div class="bg-white dark:bg-stone-900 border-2 border-stone-300 dark:border-stone-700 max-w-2xl w-full max-h-[90vh] flex flex-col">
        <div class="flex items-center justify-between p-3 border-b-2 border-stone-300 dark:border-stone-700">
          <span class="text-sm font-semibold select-none">Crop Image</span>
          <button
            type="button"
            class="text-stone-400 hover:text-stone-600 cursor-pointer"
            onClick={() => {
              open.value = false;
            }}
          >
            <TbX class="size-5" />
          </button>
        </div>
        <div
          ref={containerRef}
          class="relative overflow-hidden flex-1 min-h-0 select-none"
          style="touch-action: none"
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
        >
          <img
            ref={imgRef}
            src={imageUrl}
            alt=""
            class="w-full h-full object-contain"
            draggable={false}
          />
          {/* Darkened overlay outside crop */}
          <div
            class="absolute inset-0 pointer-events-none"
            style={`clip-path: polygon(0% 0%, 0% 100%, ${c.x * 100}% 100%, ${
              c.x * 100
            }% ${c.y * 100}%, ${(c.x + c.w) * 100}% ${c.y * 100}%, ${
              (c.x + c.w) * 100
            }% ${(c.y + c.h) * 100}%, ${c.x * 100}% ${(c.y + c.h) * 100}%, ${
              c.x * 100
            }% 100%, 100% 100%, 100% 0%); background: rgba(0,0,0,0.5);`}
          />
          {/* Crop area - draggable to move */}
          <div
            class="absolute border-2 border-white cursor-move"
            style={`left: ${c.x * 100}%; top: ${c.y * 100}%; width: ${
              c.w * 100
            }%; height: ${c.h * 100}%;`}
            onPointerDown={(e) => onPointerDown(e, "move")}
          >
            {/* Corner handles */}
            {(["nw", "ne", "sw", "se"] as const).map((corner) => (
              <div
                key={corner}
                class="absolute w-4 h-4 bg-white border-2 border-orange-600"
                style={`
                  ${corner.includes("n") ? "top: -8px" : "bottom: -8px"};
                  ${corner.includes("w") ? "left: -8px" : "right: -8px"};
                  cursor: ${corner}-resize;
                `}
                onPointerDown={(e) => onPointerDown(e, corner)}
              />
            ))}
          </div>
          {/* Click on empty area to start new crop */}
          <div
            class="absolute inset-0"
            style="cursor: crosshair; z-index: -1;"
            onPointerDown={onNewCrop}
          />
        </div>
        <div class="flex gap-2 p-3 border-t-2 border-stone-300 dark:border-stone-700">
          <button
            type="button"
            class="btn btn-primary"
            disabled={saving.value}
            onClick={applyCrop}
          >
            <TbCheck class="size-4" />
            {saving.value ? "Saving..." : "Apply"}
          </button>
          <button
            type="button"
            class="btn btn-outline"
            onClick={() => {
              open.value = false;
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
