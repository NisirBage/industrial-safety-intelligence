import { screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";

import { mockHistoricalMatches } from "../../test/mocks/handlers";
import { server } from "../../test/mocks/server";
import { renderWithProviders } from "../../test/renderWithProviders";
import { HistoricalIntelligencePanel } from "./HistoricalIntelligencePanel";

const ZONE_ID = "11111111-1111-1111-1111-111111111111";
const TIMESTAMP = "2026-07-01T08:05:00+00:00";

describe("HistoricalIntelligencePanel", () => {
  it("renders decks, matches, lessons learned, and executive insights once data loads", async () => {
    renderWithProviders(
      <HistoricalIntelligencePanel zoneId={ZONE_ID} timestamp={TIMESTAMP} currentTimeline={[]} />,
    );

    await waitFor(() => expect(screen.getByText("Demo Plant Incidents")).toBeInTheDocument());
    expect(screen.getByText(mockHistoricalMatches.matches[0].incident_name)).toBeInTheDocument();
    expect(screen.getByText("Executive Insights")).toBeInTheDocument();
    expect(
      screen.getAllByText(mockHistoricalMatches.matches[0].lessons_learned[0].lesson).length,
    ).toBeGreaterThan(0);
    expect(screen.getByText(/Evidence:/)).toBeInTheDocument();
  });

  it("shows an empty state when no similar incidents are found", async () => {
    server.use(
      http.get("http://localhost:8000/api/v1/historical/matches", () =>
        HttpResponse.json({ zone_id: ZONE_ID, timestamp: TIMESTAMP, matches: [] }),
      ),
    );
    renderWithProviders(
      <HistoricalIntelligencePanel zoneId={ZONE_ID} timestamp={TIMESTAMP} currentTimeline={[]} />,
    );

    await waitFor(() =>
      expect(screen.getByText(/no similar historical incidents found/i)).toBeInTheDocument(),
    );
  });

  it("shows the backend's error envelope when the matches request fails", async () => {
    server.use(
      http.get("http://localhost:8000/api/v1/historical/matches", () => HttpResponse.error()),
    );
    renderWithProviders(
      <HistoricalIntelligencePanel zoneId={ZONE_ID} timestamp={TIMESTAMP} currentTimeline={[]} />,
    );

    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
  });
});
