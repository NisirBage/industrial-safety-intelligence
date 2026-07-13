import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { renderWithProviders } from "../test/renderWithProviders";
import { CeoDashboardPage } from "./CeoDashboardPage";

describe("CeoDashboardPage", () => {
  it("shows the highest-risk zone's situation in plain business language", async () => {
    renderWithProviders(<CeoDashboardPage />);

    await waitFor(() =>
      expect(screen.getByText("Escalating - increased monitoring required.")).toBeInTheDocument(),
    );
    expect(screen.getByText("Current Situation")).toBeInTheDocument();
    expect(screen.getByText("Business Risk")).toBeInTheDocument();
    expect(screen.getByText("Operational Risk")).toBeInTheDocument();
    expect(screen.getByText("Estimated Downtime")).toBeInTheDocument();
    expect(screen.getByText("Workers Affected")).toBeInTheDocument();
    expect(screen.getByText("Recommended Decision")).toBeInTheDocument();
    expect(screen.getByText("Confidence")).toBeInTheDocument();
    expect(screen.getByText("Expected Outcome")).toBeInTheDocument();
    expect(screen.getByText("80%")).toBeInTheDocument();
  });
});
