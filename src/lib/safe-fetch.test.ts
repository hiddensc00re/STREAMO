import { describe, expect, it } from "vitest";
import { safeParseJson, safeParseRequestBody } from "./safe-fetch";

describe("safeParseJson", () => {
  it("parses valid JSON response", async () => {
    const response = new Response(JSON.stringify({ ok: true, data: "hello" }), {
      headers: { "Content-Type": "application/json" },
    });
    const result = await safeParseJson<{ ok: boolean; data: string }>(response);
    expect(result).toEqual({ ok: true, data: "hello" });
  });

  it("returns null for empty response body (204 No Content)", async () => {
    const response = new Response(null, { status: 204 });
    const result = await safeParseJson(response);
    expect(result).toBeNull();
  });

  it("returns null for empty text body", async () => {
    const response = new Response("");
    const result = await safeParseJson(response);
    expect(result).toBeNull();
  });

  it("returns null for whitespace-only body", async () => {
    const response = new Response("   \n  ");
    const result = await safeParseJson(response);
    expect(result).toBeNull();
  });

  it("returns null for non-JSON body (e.g. HTML error page)", async () => {
    const response = new Response("<html><body>502 Bad Gateway</body></html>", { status: 502 });
    const result = await safeParseJson(response);
    expect(result).toBeNull();
  });
});

describe("safeParseRequestBody", () => {
  it("parses valid request body JSON", async () => {
    const request = new Request("http://localhost/api/test", {
      method: "POST",
      body: JSON.stringify({ title: "Test Stream" }),
    });
    const result = await safeParseRequestBody<{ title: string }>(request);
    expect(result).toEqual({ title: "Test Stream" });
  });

  it("returns null for empty request body", async () => {
    const request = new Request("http://localhost/api/test", {
      method: "POST",
      body: "",
    });
    const result = await safeParseRequestBody(request);
    expect(result).toBeNull();
  });

  it("returns null for malformed JSON request body", async () => {
    const request = new Request("http://localhost/api/test", {
      method: "POST",
      body: "{ title: bad-json }",
    });
    const result = await safeParseRequestBody(request);
    expect(result).toBeNull();
  });
});
