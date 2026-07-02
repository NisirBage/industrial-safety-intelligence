import { describe, expect, it } from "vitest";

import { getAuditLog } from "./audit";

describe("audit API module", () => {
  it("returns an empty page - the backend writer is deferred", async () => {
    const result = await getAuditLog();
    expect(result.items).toEqual([]);
    expect(result.count).toBe(0);
  });
});
