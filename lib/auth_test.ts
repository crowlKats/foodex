import { assertEquals } from "@std/assert";
import {
  householdRequirementResponse,
  inviteCodeFromRedirect,
  nameRequirementResponse,
  sanitizeRedirect,
} from "./auth.ts";

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

function guard(path: string) {
  return householdRequirementResponse(new URL(path, "http://localhost"));
}

Deno.test("householdRequirementResponse: bounces pages through onboarding", () => {
  const res = guard("/recipes?sort=name");
  assertEquals(res?.status, 303);
  assertEquals(
    res?.headers.get("Location"),
    `/households?redirect=${encodeURIComponent("/recipes?sort=name")}`,
  );
});

Deno.test("householdRequirementResponse: falls back to plain onboarding for unsafe targets", () => {
  const res = householdRequirementResponse(
    new URL("http://localhost//evil.com/x"),
  );
  assertEquals(res?.status, 303);
  assertEquals(res?.headers.get("Location"), "/households");
});

Deno.test("householdRequirementResponse: leaves auth and onboarding reachable", () => {
  assertEquals(guard("/auth/login"), null);
  assertEquals(guard("/auth/logout"), null);
  assertEquals(guard("/households"), null);
  assertEquals(guard("/households/join/abc123"), null);
  assertEquals(guard("/_fresh/js/chunk.js"), null);
});

Deno.test("householdRequirementResponse: rejects API calls with a JSON 403", async () => {
  for (
    const path of [
      "/api/pantry",
      "/api/recipes/favorite",
      "/api/substitutions",
      "/api/agent/123/message",
      "/api/media/abc",
    ]
  ) {
    const res = guard(path);
    assertEquals(res?.status, 403);
    const body = await res?.json();
    assertEquals(typeof body.error, "string");
  }
});

Deno.test("householdRequirementResponse: leaves token- and public-authorized API endpoints open", () => {
  assertEquals(guard("/api/shopping-list-shared"), null);
  assertEquals(guard("/api/media/file/some-key.jpg"), null);
});

function nameGuard(path: string) {
  return nameRequirementResponse(new URL(path, "http://localhost"));
}

Deno.test("nameRequirementResponse: bounces pages through /welcome", () => {
  const res = nameGuard("/recipes?sort=name");
  assertEquals(res?.status, 303);
  assertEquals(
    res?.headers.get("Location"),
    `/welcome?redirect=${encodeURIComponent("/recipes?sort=name")}`,
  );
});

Deno.test("nameRequirementResponse: leaves welcome, auth, and the API open", () => {
  assertEquals(nameGuard("/welcome"), null);
  assertEquals(nameGuard("/auth/logout"), null);
  assertEquals(nameGuard("/api/pantry"), null);
});

Deno.test("householdRequirementResponse: leaves the welcome step reachable", () => {
  assertEquals(guard("/welcome"), null);
});

Deno.test("inviteCodeFromRedirect: extracts the code from an invite link", () => {
  assertEquals(inviteCodeFromRedirect("/households/join/abc123"), "abc123");
  assertEquals(
    inviteCodeFromRedirect("/households/join/abc123?redirect=/recipes"),
    "abc123",
  );
  assertEquals(inviteCodeFromRedirect("/households/join/a%2Fb"), "a/b");
});

Deno.test("inviteCodeFromRedirect: rejects everything else", () => {
  assertEquals(inviteCodeFromRedirect(null), null);
  assertEquals(inviteCodeFromRedirect(undefined), null);
  assertEquals(inviteCodeFromRedirect(""), null);
  assertEquals(inviteCodeFromRedirect("/recipes"), null);
  assertEquals(inviteCodeFromRedirect("/households"), null);
  assertEquals(inviteCodeFromRedirect("/households/join/"), null);
  assertEquals(inviteCodeFromRedirect("/households/join"), null);
  assertEquals(inviteCodeFromRedirect("/x/households/join/abc"), null);
  assertEquals(inviteCodeFromRedirect("/households/join/%zz"), null);
});

Deno.test("sanitizeRedirect: rejects header-splitting control characters", () => {
  assertEquals(sanitizeRedirect("/recipes\r\nSet-Cookie: session=x"), null);
  assertEquals(sanitizeRedirect("/recipes\u0000"), null);
});
