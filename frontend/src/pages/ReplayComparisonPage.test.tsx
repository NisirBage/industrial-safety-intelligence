import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { renderWithProviders } from "../test/renderWithProviders";
import { ReplayComparisonPage } from "./ReplayComparisonPage";

describe("ReplayComparisonPage", () => {
  it("shows both comparison sides with a shared scrubber", async () => {
    renderWithProviders(<ReplayComparisonPage />);

    await waitFor(() => expect(screen.getByText("Current Incident")).toBeInTheDocument());
    expect(screen.getByText("Historical Incident")).toBeInTheDocument();
    expect(screen.getByRole("slider", { name: "Replay comparison progress" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Play" })).toBeInTheDocument();
  });
});
