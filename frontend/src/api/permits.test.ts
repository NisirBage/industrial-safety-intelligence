import { describe, expect, it } from "vitest";

import { mockPermits } from "../test/mocks/handlers";
import { getPermits } from "./permits";

describe("permits API module", () => {
  it("returns permits filtered by status", async () => {
    const result = await getPermits({ status: "active" });
    expect(result.items).toEqual(mockPermits);
  });

  it("returns an empty page for a status with no matches", async () => {
    const result = await getPermits({ status: "closed" });
    expect(result.items).toEqual([]);
    expect(result.count).toBe(0);
  });
});
