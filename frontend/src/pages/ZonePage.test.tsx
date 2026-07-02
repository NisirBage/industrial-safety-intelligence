import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { renderWithProviders } from "../test/renderWithProviders";
import { ZonePage } from "./ZonePage";

const ZONE_A = "11111111-1111-1111-1111-111111111111";

describe("ZonePage", () => {
  it("shows a zone picker when no zone is selected", async () => {
    renderWithProviders(<ZonePage />, { initialRoute: "/zones" });
    await waitFor(() => expect(screen.getByText("Zones")).toBeInTheDocument());
    await waitFor(() => expect(screen.getAllByRole("link").length).toBeGreaterThan(0));
  });

  it("shows current risk, trend, and history chart for a selected zone", async () => {
    renderWithProviders(<ZonePage />, {
      initialRoute: `/zones/${ZONE_A}`,
      routePath: "/zones/:zoneId",
    });

    await waitFor(() => expect(screen.getByText(/Current risk: 72.5/)).toBeInTheDocument());
    // history[0]=72.5 > history[1]=40.0 -> rising
    expect(screen.getByText(/rising/)).toBeInTheDocument();
  });
});
