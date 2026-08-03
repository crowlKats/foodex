import { assertEquals } from "@std/assert";
import { sanitizeRedirect } from "./auth.ts";

Deno.test("sanitizeRedirect: keeps same-origin paths", () => {
  assertEquals(
    sanitizeRedirect("/households/join/abc123"),
    "/households/join/abc123",
  );
  assertEquals(sanitizeRedirect("/recipes?sort=name"), "/recipes?sort=name");
});

Deno.test("sanitizeRedirect: rejects empty and missing values", () => {
  assertEquals(sanitizeRedirect(null), null);
  assertEquals(sanitizeRedirect(undefined), null);
  assertEquals(sanitizeRedirect(""), null);
});

Deno.test("sanitizeRedirect: rejects off-site destinations", () => {
  assertEquals(sanitizeRedirect("https://evil.com/"), null);
  assertEquals(sanitizeRedirect("//evil.com/x"), null);
  assertEquals(sanitizeRedirect("/\\evil.com/x"), null);
  assertEquals(sanitizeRedirect("recipes"), null);
});

Deno.test("sanitizeRedirect: rejects paths that re-enter the auth flow", () => {
  assertEquals(sanitizeRedirect("/auth/login"), null);
  assertEquals(sanitizeRedirect("/auth/callback/email?token=x"), null);
});

Deno.test("sanitizeRedirect: rejects header-splitting control characters", () => {
  assertEquals(sanitizeRedirect("/recipes\r\nSet-Cookie: session=x"), null);
  assertEquals(sanitizeRedirect("/recipes\u0000"), null);
});
