import { assertEquals } from "@std/assert";
import { loginUrl } from "./auth.ts";
import {
  isShareRecordFresh,
  SHARE_MAX_AGE_MS,
  SHARE_TARGET_DB,
  SHARE_TARGET_FILES_FIELD,
  SHARE_TARGET_KEY,
  SHARE_TARGET_STORE,
  sharedImportText,
  shareFieldsFromFormData,
  shareRecordToFiles,
  shareTargetLandingPath,
} from "./share-target.ts";

Deno.test("sharedImportText: prefers a URL, then text, then title", () => {
  assertEquals(
    sharedImportText({ url: "https://example.com/cake" }),
    "https://example.com/cake",
  );
  assertEquals(
    sharedImportText({ text: "Halve the sugar" }),
    "Halve the sugar",
  );
  assertEquals(sharedImportText({ title: "Lamingtons" }), "Lamingtons");
  assertEquals(sharedImportText({}), "");
});

Deno.test("sharedImportText: Android often puts the URL in text", () => {
  const url = "https://example.com/cake";
  assertEquals(sharedImportText({ text: url }), url);
  assertEquals(
    sharedImportText({ title: "Cake", text: url }),
    url,
  );
  assertEquals(
    sharedImportText({ url: "", text: `Cake recipe\n${url}` }),
    `Cake recipe\n${url}`,
  );
});

Deno.test("sharedImportText: keeps extra text when it already contains the URL", () => {
  const url = "https://example.com/cake";
  assertEquals(
    sharedImportText({ url, text: `Try this\n${url}` }),
    `Try this\n${url}`,
  );
  assertEquals(
    sharedImportText({ url, text: url }),
    url,
  );
});

Deno.test("sharedImportText: concatenates a distinct URL and text", () => {
  assertEquals(
    sharedImportText({
      url: "https://example.com/cake",
      text: "halve the sugar",
    }),
    "https://example.com/cake\nhalve the sugar",
  );
});

Deno.test("sharedImportText: trims whitespace and ignores empty fields", () => {
  assertEquals(
    sharedImportText({ url: "  https://example.com/cake  ", text: "  " }),
    "https://example.com/cake",
  );
  assertEquals(sharedImportText({ title: "   " }), "");
});

Deno.test("shareTargetLandingPath: encodes url and text as query params", () => {
  assertEquals(shareTargetLandingPath({}), "/recipes/new");
  assertEquals(
    shareTargetLandingPath({ url: "https://example.com/cake" }),
    `/recipes/new?url=${encodeURIComponent("https://example.com/cake")}`,
  );
  const both = shareTargetLandingPath({
    url: "https://example.com/cake",
    text: "halve the sugar",
  });
  const params = new URL(both, "https://foodex.example").searchParams;
  assertEquals(params.get("url"), "https://example.com/cake");
  assertEquals(params.get("text"), "halve the sugar");
});

Deno.test("shareTargetLandingPath: title only when there is no url or text", () => {
  assertEquals(
    shareTargetLandingPath({ title: "Lamingtons" }),
    `/recipes/new?title=${encodeURIComponent("Lamingtons")}`,
  );
  assertEquals(
    shareTargetLandingPath({
      title: "Lamingtons",
      url: "https://example.com/cake",
    }),
    `/recipes/new?url=${encodeURIComponent("https://example.com/cake")}`,
  );
});

Deno.test("shareTargetLandingPath: caps oversized query values", () => {
  const long = "a".repeat(5000);
  const path = shareTargetLandingPath({ text: long });
  const params = new URL(path, "https://foodex.example").searchParams;
  assertEquals(params.get("text")?.length, 2000);
});

Deno.test("shareFieldsFromFormData: reads string fields and ignores files", () => {
  const form = new FormData();
  form.set("title", "Cake");
  form.set("text", "https://example.com/cake");
  form.set("url", "");
  form.set("images", new File([new Uint8Array([1, 2, 3])], "page.jpg"));
  assertEquals(shareFieldsFromFormData(form), {
    title: "Cake",
    text: "https://example.com/cake",
    url: "",
  });
});

Deno.test("isShareRecordFresh: 24-hour window", () => {
  const now = 1_700_000_000_000;
  assertEquals(isShareRecordFresh({ createdAt: now }, now), true);
  assertEquals(
    isShareRecordFresh({ createdAt: now - SHARE_MAX_AGE_MS + 1 }, now),
    true,
  );
  assertEquals(
    isShareRecordFresh({ createdAt: now - SHARE_MAX_AGE_MS }, now),
    false,
  );
  assertEquals(isShareRecordFresh({ createdAt: now + 10_000 }, now), false);
  assertEquals(isShareRecordFresh({}, now), false);
});

Deno.test("shareRecordToFiles: rebuilds File objects from ArrayBuffers", () => {
  const buffer = new Uint8Array([0xff, 0xd8, 0xff]).buffer;
  const files = shareRecordToFiles({
    createdAt: Date.now(),
    files: [
      { name: "page.jpg", type: "image/jpeg", buffer },
      { name: "empty.png", type: "image/png", buffer: new ArrayBuffer(0) },
    ],
  });
  assertEquals(files.length, 1);
  assertEquals(files[0].name, "page.jpg");
  assertEquals(files[0].type, "image/jpeg");
  assertEquals(files[0].size, 3);
});

Deno.test("shared URL survives the login redirect helper", () => {
  const dest = shareTargetLandingPath({ url: "https://example.com/cake" });
  assertEquals(
    loginUrl(dest),
    `/auth/login?redirect=${encodeURIComponent(dest)}`,
  );
});

Deno.test("service worker uses the same share-target IndexedDB contract", async () => {
  const sw = await Deno.readTextFile(
    new URL("../public/sw.js", import.meta.url),
  );
  for (
    const token of [
      SHARE_TARGET_DB,
      SHARE_TARGET_STORE,
      SHARE_TARGET_KEY,
      SHARE_TARGET_FILES_FIELD,
      "/recipes/new",
    ]
  ) {
    assertEquals(sw.includes(token), true);
  }
});

Deno.test("manifest registers a POST share target at New Recipe", async () => {
  const manifest = JSON.parse(
    await Deno.readTextFile(
      new URL("../public/manifest.json", import.meta.url),
    ),
  );
  assertEquals(manifest.share_target.action, "/recipes/new");
  assertEquals(manifest.share_target.method, "POST");
  assertEquals(manifest.share_target.enctype, "multipart/form-data");
  assertEquals(manifest.share_target.params.title, "title");
  assertEquals(manifest.share_target.params.text, "text");
  assertEquals(manifest.share_target.params.url, "url");
  assertEquals(
    manifest.share_target.params.files[0].name,
    SHARE_TARGET_FILES_FIELD,
  );
  assertEquals(
    manifest.share_target.params.files[0].accept.includes("image/*"),
    true,
  );
});
