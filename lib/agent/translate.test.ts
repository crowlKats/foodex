import { assert, assertEquals, assertRejects } from "@std/assert";
import type { FilePart } from "ai";
import { foldConversation } from "./conversation.ts";
import type { AgentEvent } from "./events.ts";
import { resolveImages } from "./loop.ts";
import { toModelMessages } from "./translate.ts";

function log(...bodies: Omit<AgentEvent, "seq">[]): AgentEvent[] {
  return bodies.map((b, i) => ({ ...b, seq: i + 1 } as AgentEvent));
}

const JPEG_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);

function filePart(messages: ReturnType<typeof toModelMessages>): FilePart {
  assertEquals(messages.length, 1);
  assertEquals(messages[0].role, "user");
  const content = messages[0].content;
  assert(Array.isArray(content));
  const part = content.find((p) => p.type === "file");
  assert(part && part.type === "file");
  return part;
}

Deno.test("toModelMessages: attached photos are tagged inline bytes, not a URL string", () => {
  const messages = toModelMessages([{
    role: "user",
    content: [
      { type: "text", text: "Attached image (media id: m1):" },
      { type: "image", data: JPEG_BYTES, media_type: "image/jpeg" },
      {
        type: "text",
        text: "Add the recipe from this photo to the library.",
      },
    ],
  }]);

  const part = filePart(messages);
  assertEquals(part.mediaType, "image/jpeg");
  assertEquals(part.data, { type: "data", data: JPEG_BYTES });
  assert(typeof part.data !== "string");
  assert(!(part.data instanceof URL));
});

Deno.test("resolveImages: image_ref becomes a byte block", async () => {
  const folded = foldConversation(log({
    type: "user_message",
    payload: {
      text: "Add the recipe from this photo to the library.",
      images: [{
        media_id: "m1",
        key: "uploads/x.jpg",
        content_type: "image/jpeg",
        url: "/api/media/file/uploads/x.jpg",
      }],
    },
  }));

  const out = await resolveImages(
    folded.apiMessages,
    new Map(),
    (key) => {
      assertEquals(key, "uploads/x.jpg");
      return Promise.resolve(JPEG_BYTES);
    },
  );

  assertEquals(out[0].role, "user");
  assertEquals(out[0].content, [
    { type: "text", text: "Attached image (media id: m1):" },
    { type: "image", data: JPEG_BYTES, media_type: "image/jpeg" },
    { type: "text", text: "Add the recipe from this photo to the library." },
  ]);

  const part = filePart(toModelMessages(out));
  assertEquals(part.data, { type: "data", data: JPEG_BYTES });
  assertEquals(part.mediaType, "image/jpeg");
});

Deno.test("resolveImages: S3 miss fails the turn instead of dropping the photo", async () => {
  const folded = foldConversation(log({
    type: "user_message",
    payload: {
      text: "Add the recipe from this photo to the library.",
      images: [{
        media_id: "m1",
        key: "uploads/missing.jpg",
        content_type: "image/jpeg",
        url: "/api/media/file/uploads/missing.jpg",
      }],
    },
  }));

  await assertRejects(
    () =>
      resolveImages(folded.apiMessages, new Map(), () => Promise.resolve(null)),
    Error,
    "Could not load attached image (media id: m1).",
  );
});
