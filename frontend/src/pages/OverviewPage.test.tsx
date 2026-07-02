import { screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";

import { server } from "../test/mocks/server";
import { renderWithProviders } from "../test/renderWithProviders";
import { OverviewPage } from "./OverviewPage";

describe("OverviewPage", () => {
  it("shows a loading state before data arrives", () => {
    renderWithProviders(<OverviewPage />);
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("renders the worst tier and one card per zone once data loads", async () => {
    renderWithProviders(<OverviewPage />);

    await waitFor(() => expect(screen.getByText("Zones reporting: 2")).toBeInTheDocument());
    // "elevated" appears twice: the plant-status badge and zone A's own card.
    expect(screen.getAllByText("elevated").length).toBe(2);
  });

  it("shows an empty state when no zone has reported yet", async () => {
    server.use(
      http.get("http://localhost:8000/api/v1/risk/current", () => HttpResponse.json([])),
    );
    renderWithProviders(<OverviewPage />);

    await waitFor(() =>
      expect(screen.getByText(/no risk assessments have been recorded/i)).toBeInTheDocument(),
    );
  });

  it("shows the backend's error envelope when the backend is unavailable", async () => {
    server.use(
      http.get("http://localhost:8000/api/v1/risk/current", () => HttpResponse.error()),
    );
    renderWithProviders(<OverviewPage />);

    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.getByText("NETWORK_ERROR")).toBeInTheDocument();
  });
});
