import { assert, assertEquals } from "@std/assert";
import sharp from "sharp";
import { reduceImage } from "./image-reduce.ts";

Deno.test("reduceImage: downscales oversized photos to capped webp", async () => {
  const jpeg = await sharp({
    create: {
      width: 4000,
      height: 3000,
      channels: 3,
      background: { r: 128, g: 128, b: 128 },
      noise: { type: "gaussian", mean: 128, sigma: 30 },
    },
  }).jpeg({ quality: 95 }).toBuffer();

  const reduced = await reduceImage(new Uint8Array(jpeg), "image/jpeg", "jpg");
  assert(reduced);
  assertEquals(reduced.contentType, "image/webp");
  assertEquals(reduced.ext, "webp");
  assert(reduced.bytes.length < jpeg.length);
  const meta = await sharp(reduced.bytes).metadata();
  assertEquals(meta.format, "webp");
  assertEquals(Math.max(meta.width!, meta.height!), 2048);
});

Deno.test("reduceImage: never returns more bytes than it was given", async () => {
  const inputs = [
    await sharp({
      create: {
        width: 8,
        height: 8,
        channels: 3,
        background: { r: 10, g: 20, b: 30 },
      },
    }).jpeg().toBuffer(),
    await sharp({
      create: {
        width: 1,
        height: 1,
        channels: 3,
        background: { r: 0, g: 0, b: 0 },
      },
    }).png().toBuffer(),
  ];
  for (const input of inputs) {
    const reduced = await reduceImage(
      new Uint8Array(input),
      "image/png",
      "png",
    );
    assert(reduced);
    assert(reduced.bytes.length <= input.length);
  }
});

Deno.test("reduceImage: rejects bytes that are not an image", async () => {
  const junk = new TextEncoder().encode("definitely not an image");
  assertEquals(await reduceImage(junk, "image/jpeg", "jpg"), null);
});
