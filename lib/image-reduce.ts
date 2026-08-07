// Server-side image reduction: permanent assets are stored as capped WebP
// so the bucket doesn't grow with full-resolution camera output.
import sharp from "sharp";

const MAX_DIM = 2048;
const WEBP_QUALITY = 80;

/** Still-image types we re-encode. Gifs pass through to keep animation. */
export const REDUCIBLE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
]);

export interface ReducedImage {
  bytes: Uint8Array;
  contentType: string;
  ext: string;
}

/**
 * Downscale to at most 2048px and re-encode as WebP. `rotate()` bakes the
 * EXIF orientation in before the re-encode strips the metadata. Returns null
 * when the bytes don't decode as an image, and keeps the original when the
 * re-encoded form would be larger (already-optimized files).
 */
export async function reduceImage(
  bytes: Uint8Array,
  contentType: string,
  ext: string,
): Promise<ReducedImage | null> {
  let out: Uint8Array;
  try {
    out = await sharp(bytes)
      .rotate()
      .resize(MAX_DIM, MAX_DIM, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: WEBP_QUALITY })
      .toBuffer();
  } catch {
    return null;
  }
  if (out.length >= bytes.length) {
    return { bytes, contentType, ext };
  }
  return { bytes: out, contentType: "image/webp", ext: "webp" };
}
