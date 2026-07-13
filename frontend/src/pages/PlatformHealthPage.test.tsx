import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { renderWithProviders } from "../test/renderWithProviders";
import { PlatformHealthPage } from "./PlatformHealthPage";

describe("PlatformHealthPage", () => {
  it("shows the overall status and every subsystem check", async () => {
    renderWithProviders(<PlatformHealthPage />);

    await waitFor(() => expect(screen.getAllByText("Healthy").length).toBeGreaterThan(0));
    expect(screen.getByText("1.0.0")).toBeInTheDocument();
    expect(screen.getByText("Database")).toBeInTheDocument();
    expect(screen.getByText("Replay Engine")).toBeInTheDocument();
    expect(screen.getByText("Historical Intelligence")).toBeInTheDocument();
    expect(screen.getByText("Operational Foresight")).toBeInTheDocument();
    expect(screen.getByText("Knowledge Graph")).toBeInTheDocument();
    expect(screen.getByText("Storage")).toBeInTheDocument();
    expect(screen.getByText("Live Data Connectors")).toBeInTheDocument();
  });
});
