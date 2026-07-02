import { describe, expect, it } from "vitest";

import { mockCurrentRisk, mockRiskHistory } from "../test/mocks/handlers";
import { getCurrentRisk, getRiskHistory } from "./risk";

describe("risk API module", () => {
  it("getCurrentRisk returns the plant-wide snapshot", async () => {
    const result = await getCurrentRisk();
    expect(result).toEqual(mockCurrentRisk);
  });

  it("getRiskHistory returns a paginated envelope for a zone", async () => {
    const result = await getRiskHistory("11111111-1111-1111-1111-111111111111", { limit: 10 });
    expect(result.items).toEqual(mockRiskHistory);
    expect(result.count).toBe(mockRiskHistory.length);
  });
});
