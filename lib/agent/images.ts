// Resolve folded `image_ref` markers into `image` blocks carrying S3 bytes.
// The fold is pure (see conversation.ts); this is the only S3 read on the
// photo path, and it runs just before toModelMessages.

import { getFile } from "../s3.ts";
import type { FoldMessage, UserBlock } from "./conversation.ts";

async function loadAttachmentBytes(key: string): Promise<Uint8Array | null> {
  const f = await getFile(key);
  if (!f) return null;
  return new Uint8Array(await new Response(f.body).arrayBuffer());
}

/**
 * Replace the fold's `image_ref` markers with blocks carrying the bytes, read
 * from S3. `cache` spans the steps of one turn, so each image is fetched at
 * most once per turn. A missing object fails the turn rather than dropping
 * the photo (which left the model with only the media-id text, so it tried
 * fetch_url).
 */
export async function resolveImages(
  messages: FoldMessage[],
  cache: Map<string, Uint8Array>,
  load: (key: string) => Promise<Uint8Array | null> = loadAttachmentBytes,
): Promise<FoldMessage[]> {
  const out: FoldMessage[] = [];
  for (const m of messages) {
    if (m.role === "assistant") {
      out.push(m);
      continue;
    }
    const blocks: UserBlock[] = [];
    for (const b of m.content) {
      if (b.type !== "image_ref") {
        blocks.push(b);
        continue;
      }
      let data = cache.get(b.key);
      if (data === undefined) {
        const loaded = await load(b.key);
        if (loaded == null) {
          throw new Error(
            `Could not load attached image (media id: ${b.media_id}).`,
          );
        }
        cache.set(b.key, loaded);
        data = loaded;
      }
      blocks.push({ type: "image", data, media_type: b.content_type });
    }
    out.push({ role: "user", content: blocks });
  }
  return out;
}
