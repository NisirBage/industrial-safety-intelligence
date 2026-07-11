import { describe, expect, it } from "vitest";

import {
  mockHistoricalAnalytics,
  mockHistoricalDecks,
  mockHistoricalMatches,
} from "../test/mocks/handlers";
import { getHistoricalAnalytics, getHistoricalDecks, getHistoricalMatches } from "./historical";

describe("historical API module", () => {
  it("getHistoricalDecks returns every deck", async () => {
    const result = await getHistoricalDecks();
    expect(result).toEqual(mockHistoricalDecks);
  });

  it("getHistoricalMatches returns similar incidents for a zone/timestamp", async () => {
    const result = await getHistoricalMatches(
      "11111111-1111-1111-1111-111111111111",
      "2026-07-01T08:05:00+00:00",
      { topN: 5 },
    );
    expect(result).toEqual(mockHistoricalMatches);
  });

  it("getHistoricalAnalytics returns cross-scenario aggregation", async () => {
    const result = await getHistoricalAnalytics();
    expect(result).toEqual(mockHistoricalAnalytics);
  });
});
