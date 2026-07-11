import { screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";

import type { RiskAssessment } from "../../api/types";
import { mockForesightResult } from "../../test/mocks/handlers";
import { server } from "../../test/mocks/server";
import { renderWithProviders } from "../../test/renderWithProviders";
import { OperationalForesightPanel } from "./OperationalForesightPanel";

const ZONE_ID = "11111111-1111-1111-1111-111111111111";
const TIMESTAMP = "2026-07-01T08:05:00+00:00";

const currentTimeline: RiskAssessment[] = [
  {
    assessment_id: "a1",
    zone_id: ZONE_ID,
    timestamp: TIMESTAMP,
    compound_risk_score: 60.0,
    confidence: 0.9,
    tier: "watch",
    justification: { schema_version: 1 },
  },
];

describe("OperationalForesightPanel", () => {
  it("renders the forecast, confidence, progression, and early warning once data loads", async () => {
    renderWithProviders(
      <OperationalForesightPanel
        zoneId={ZONE_ID}
        timestamp={TIMESTAMP}
        scenarioKey="demo_vizag_clairton"
        currentTimeline={currentTimeline}
      />,
    );

    await waitFor(() => expect(screen.getByText("Executive Insights")).toBeInTheDocument());
    expect(screen.getByText(mockForesightResult.early_warning.category)).toBeInTheDocument();
    expect(screen.getByText("Incident Progression")).toBeInTheDocument();
    expect(screen.getByText(/Overall confidence/)).toBeInTheDocument();
    expect(screen.getByText(/Evidence quality/)).toBeInTheDocument();
  });

  it("shows an empty state when no matched trajectories are found", async () => {
    server.use(
      http.get("http://localhost:8000/api/v1/foresight/forecast", () =>
        HttpResponse.json({
          ...mockForesightResult,
          matches: [],
          deck_contributions: [],
        }),
      ),
    );
    renderWithProviders(
      <OperationalForesightPanel
        zoneId={ZONE_ID}
        timestamp={TIMESTAMP}
        scenarioKey="demo_vizag_clairton"
        currentTimeline={currentTimeline}
      />,
    );

    await waitFor(() =>
      expect(screen.getByText(/no similar historical trajectories found/i)).toBeInTheDocument(),
    );
  });

  it("shows the backend's error envelope when the forecast request fails", async () => {
    server.use(
      http.get("http://localhost:8000/api/v1/foresight/forecast", () => HttpResponse.error()),
    );
    renderWithProviders(
      <OperationalForesightPanel
        zoneId={ZONE_ID}
        timestamp={TIMESTAMP}
        scenarioKey="demo_vizag_clairton"
        currentTimeline={currentTimeline}
      />,
    );

    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
  });
});
