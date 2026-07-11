import { describe, expect, it } from "vitest";

import { mockForesightResult } from "../test/mocks/handlers";
import { getForesightForecast } from "./foresight";

describe("foresight API module", () => {
  it("getForesightForecast returns the trajectory-matched forecast result", async () => {
    const result = await getForesightForecast(
      "11111111-1111-1111-1111-111111111111",
      "2026-07-01T08:05:00+00:00",
      "demo_vizag_clairton",
      { windowSize: 5, topN: 5 },
    );
    expect(result).toEqual(mockForesightResult);
  });
});
