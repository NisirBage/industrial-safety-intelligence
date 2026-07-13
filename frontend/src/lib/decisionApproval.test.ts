import { beforeEach, describe, expect, it } from "vitest";

import {
  clearLocalAcknowledgment,
  getLocalAcknowledgment,
  setLocalAcknowledgment,
} from "./decisionApproval";

describe("decisionApproval", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("returns null when nothing has been acknowledged", () => {
    expect(getLocalAcknowledgment("a1")).toBeNull();
  });

  it("stores and retrieves an acknowledgment, scoped per assessment", () => {
    setLocalAcknowledgment("a1", "Reviewed with shift supervisor.", "2026-07-01T08:10:00.000Z");

    expect(getLocalAcknowledgment("a1")).toEqual({
      acknowledgedAtIso: "2026-07-01T08:10:00.000Z",
      note: "Reviewed with shift supervisor.",
    });
    expect(getLocalAcknowledgment("a2")).toBeNull();
  });

  it("clears an acknowledgment", () => {
    setLocalAcknowledgment("a1", "note", "2026-07-01T08:10:00.000Z");
    clearLocalAcknowledgment("a1");

    expect(getLocalAcknowledgment("a1")).toBeNull();
  });

  it("returns null for malformed stored data instead of throwing", () => {
    sessionStorage.setItem("isip.decision-ack.a1", "not json");

    expect(getLocalAcknowledgment("a1")).toBeNull();
  });
});
