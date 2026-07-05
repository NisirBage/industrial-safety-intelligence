import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { renderWithProviders } from "../test/renderWithProviders";
import { PermitsPage } from "./PermitsPage";

describe("PermitsPage", () => {
  it("shows the active permit and empty groups for the others", async () => {
    renderWithProviders(<PermitsPage />);

    await waitFor(() => expect(screen.getByText("Hot Work")).toBeInTheDocument());
    expect(screen.getByText("Active (1)")).toBeInTheDocument();
    expect(screen.getByText("Flagged (0)")).toBeInTheDocument();
    expect(screen.getByText("Suspend Recommended (0)")).toBeInTheDocument();
  });

  it("expands a permit card to show its baseline snapshot", async () => {
    const { default: userEvent } = await import("@testing-library/user-event");
    const user = userEvent.setup();
    renderWithProviders(<PermitsPage />);

    await waitFor(() => expect(screen.getByText("Hot Work")).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: /show details/i }));

    expect(screen.getByText(/gas_risk_at_issuance/)).toBeInTheDocument();
  });
});
