// Client-side (canvas) helper: re-encode a photo as a capped JPEG so uploads
// stay small and within the vision API's per-image size limit. Island-only —
// must never be imported from server code.

const MAX_IMAGE_DIM = 2048;

export async function downscaleImage(file: File): Promise<Blob> {
  const img = new Image();
  const url = URL.createObjectURL(file);
  try {
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("Could not read image"));
      img.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
  const scale = Math.min(
    1,
    MAX_IMAGE_DIM / Math.max(img.naturalWidth, img.naturalHeight),
  );
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
  return await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (b) => b ? resolve(b) : reject(new Error("Image processing failed")),
      "image/jpeg",
      0.85,
    )
  );
}

/** Downscale + upload a batch of photos; returns their media ids in order. */
export async function uploadImages(files: File[]): Promise<string[]> {
  const ids: string[] = [];
  for (const file of files) {
    const blob = await downscaleImage(file);
    const fd = new FormData();
    fd.append("file", blob, "photo.jpg");
    const res = await fetch("/api/upload", { method: "POST", body: fd });
    // Never trust the body blindly: server errors can come back as HTML
    // (the dev server even serves its error page with a 200 status).
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.id) {
      throw new Error(
        data?.error ?? `Image upload failed (HTTP ${res.status})`,
      );
    }
    ids.push(String(data.id));
  }
  return ids;
}
