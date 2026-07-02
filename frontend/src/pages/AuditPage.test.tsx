import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { renderWithProviders } from "../test/renderWithProviders";
import { AuditPage } from "./AuditPage";

describe("AuditPage", () => {
  it("shows the deferred-writer empty state - no audit entries exist yet", async () => {
    renderWithProviders(<AuditPage />);

    await waitFor(() =>
      expect(screen.getByText(/hash-chained writer is deferred/i)).toBeInTheDocument(),
    );
  });

  it("offers an event-type filter with all four backend event types", () => {
    renderWithProviders(<AuditPage />);

    const select = screen.getByLabelText(/event type/i);
    expect(select).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "risk_computed" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "permit_flagged" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "alert_sent" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "action_confirmed" })).toBeInTheDocument();
  });
});
