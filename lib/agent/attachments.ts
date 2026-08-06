// Resolving user-attached images (media ids) into the denormalized shape
// stored on user_message events. Shared by the message endpoint and
// session creation with an initial message.

import type { QueryFn } from "../../db/mod.ts";
import type { UserMessageImage } from "./events.ts";

/** Anthropic vision media types; attachments outside this set are rejected. */
export const VISION_MEDIA_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
] as const;

export const MAX_MESSAGE_IMAGES = 10;

export async function resolveAttachedImages(
  q: QueryFn,
  householdId: string,
  imageIds: string[],
): Promise<{ images: UserMessageImage[] } | { error: string }> {
  if (imageIds.length > MAX_MESSAGE_IMAGES) {
    return { error: `At most ${MAX_MESSAGE_IMAGES} images per message` };
  }
  if (imageIds.length === 0) return { images: [] };
  const res = await q<{
    id: string;
    key: string;
    content_type: string;
    url: string;
  }>(
    `SELECT id, key, content_type, url FROM media
     WHERE id = ANY($1) AND household_id = $2`,
    [imageIds, householdId],
  );
  const byId = new Map(res.rows.map((m) => [String(m.id), m]));
  const images: UserMessageImage[] = [];
  for (const id of imageIds) {
    const m = byId.get(id);
    if (!m) return { error: "Unknown image attachment" };
    if (!(VISION_MEDIA_TYPES as readonly string[]).includes(m.content_type)) {
      return { error: `Unsupported image type ${m.content_type}` };
    }
    images.push({
      media_id: String(m.id),
      key: m.key,
      content_type: m.content_type,
      url: m.url,
    });
  }
  return { images };
}
