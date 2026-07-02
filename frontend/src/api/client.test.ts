import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";

import { server } from "../test/mocks/server";
import { apiGet, ApiError } from "./client";

describe("apiGet", () => {
  it("returns parsed JSON on success", async () => {
    server.use(
      http.get("http://localhost:8000/api/v1/test", () => HttpResponse.json({ ok: true })),
    );

    const result = await apiGet<{ ok: boolean }>("/api/v1/test");
    expect(result).toEqual({ ok: true });
  });

  it("sends query parameters, omitting undefined values", async () => {
    let capturedUrl = "";
    server.use(
      http.get("http://localhost:8000/api/v1/test", ({ request }) => {
        capturedUrl = request.url;
        return HttpResponse.json({});
      }),
    );

    await apiGet("/api/v1/test", { limit: 10, status: undefined, zone_id: "abc" });

    expect(capturedUrl).toContain("limit=10");
    expect(capturedUrl).toContain("zone_id=abc");
    expect(capturedUrl).not.toContain("status");
  });

  it("throws an ApiError carrying the backend's own error envelope on a 4xx/5xx", async () => {
    server.use(
      http.get("http://localhost:8000/api/v1/test", () =>
        HttpResponse.json(
          { error: { code: "INVALID_STATUS", message: "bad status", details: null } },
          { status: 400 },
        ),
      ),
    );

    await expect(apiGet("/api/v1/test")).rejects.toMatchObject({
      code: "INVALID_STATUS",
      message: "bad status",
      status: 400,
    });
  });

  it("throws MALFORMED_RESPONSE when an error status has no valid envelope", async () => {
    server.use(
      http.get("http://localhost:8000/api/v1/test", () =>
        HttpResponse.text("not json", { status: 500 }),
      ),
    );

    await expect(apiGet("/api/v1/test")).rejects.toMatchObject({
      code: "MALFORMED_RESPONSE",
      status: 500,
    });
  });

  it("throws NETWORK_ERROR when the backend is unreachable", async () => {
    server.use(http.get("http://localhost:8000/api/v1/test", () => HttpResponse.error()));

    const error = await apiGet("/api/v1/test").catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe("NETWORK_ERROR");
  });
});
