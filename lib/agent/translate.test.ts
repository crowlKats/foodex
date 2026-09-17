import { assert, assertEquals, assertRejects } from "@std/assert";
import type { FilePart } from "ai";
import { foldConversation, photoSourceNote } from "./conversation.ts";
import type { AgentEvent } from "./events.ts";
import { resolveImages } from "./images.ts";
import { toModelMessages } from "./translate.ts";
import { emptyAssistantError, formatTurnError } from "./turn-error.ts";

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

/** User-facing FilePart.data is DataContent | URL | tagged FileData. We send bytes. */
function assertInlineBytes(part: FilePart, bytes: Uint8Array) {
  assertEquals(part.mediaType, "image/jpeg");
  assert(
    part.data instanceof Uint8Array,
    "FilePart.data must be a Uint8Array, not a tagged { type: 'data' } wrapper or a string",
  );
  assertEquals(part.data, bytes);
  assert(typeof part.data !== "string");
  assert(!(part.data instanceof URL));
}

Deno.test("toModelMessages: attached photos are Uint8Array file data, not a URL string", () => {
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

  assertInlineBytes(filePart(messages), JPEG_BYTES);
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
    { type: "text", text: photoSourceNote(1) },
    { type: "text", text: "Attached image (media id: m1):" },
    { type: "image", data: JPEG_BYTES, media_type: "image/jpeg" },
    { type: "text", text: "Add the recipe from this photo to the library." },
  ]);

  assertInlineBytes(filePart(toModelMessages(out)), JPEG_BYTES);
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

Deno.test("emptyAssistantError: blank model output is an error, not a persisted bubble", () => {
  assertEquals(
    emptyAssistantError([], "stop"),
    "The assistant returned no content.",
  );
  assertEquals(
    emptyAssistantError([], "error"),
    "The assistant returned no content (error).",
  );
  assertEquals(
    emptyAssistantError([{ type: "text" }], "stop"),
    null,
  );
});

Deno.test("formatTurnError: never empty, truncates huge dumps", () => {
  assertEquals(
    formatTurnError(new Error("")),
    "The assistant failed to respond.",
  );
  assertEquals(formatTurnError({}), "The assistant failed to respond.");
  assertEquals(
    formatTurnError(new Error("Could not load attached image (media id: m1).")),
    "Could not load attached image (media id: m1).",
  );
  const huge = "x".repeat(4000);
  const out = formatTurnError(new Error(huge));
  assert(out.endsWith("…"));
  assert(out.length < 1600);
});
