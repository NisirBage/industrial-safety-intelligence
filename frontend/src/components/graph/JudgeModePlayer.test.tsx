import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";

import type { GraphEntity } from "../../api/types";
import { server } from "../../test/mocks/server";
import { renderWithProviders } from "../../test/renderWithProviders";
import { JudgeModePlayer } from "./JudgeModePlayer";

const assessment: GraphEntity = {
  kind: "risk_assessment",
  id: "a1",
  label: "Risk assessment a1",
  attributes: {},
};

describe("JudgeModePlayer", () => {
  it("shows only the anchor step when the assessment has no triggered agent", async () => {
    // The shared mock's /graph/neighbors response only contains a
    // CONTAINS->Sensor edge (no "triggered" relation), so no agent,
    // historical match, forecast, or recommendation steps apply.
    renderWithProviders(
      <JudgeModePlayer assessment={assessment} onHighlightEdges={vi.fn()} onFocusEntity={vi.fn()} />,
    );

    await waitFor(() => expect(screen.getByText("Risk assessment")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /Play/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Next/ })).toBeDisabled();
  });

  it("builds the full sensor -> agent -> risk -> recommendation chain and highlights edges as steps advance", async () => {
    server.use(
      http.get("http://localhost:8000/api/v1/graph/neighbors/:kind/:id", ({ params }) => {
        if (params.kind === "risk_assessment") {
          return HttpResponse.json({
            entity: assessment,
            neighbors: [
              {
                edge: {
                  source_kind: "risk_assessment",
                  source_id: "a1",
                  relation: "triggered",
                  target_kind: "triggered_agent",
                  target_id: "a1|gas_risk",
                  label: "gas risk",
                },
                entity: { kind: "triggered_agent", id: "a1|gas_risk", label: "Gas Risk", attributes: {} },
              },
              {
                edge: {
                  source_kind: "risk_assessment",
                  source_id: "a1",
                  relation: "generated",
                  target_kind: "recommendation",
                  target_id: "a1|tier_critical",
                  label: "Recommendation",
                },
                entity: {
                  kind: "recommendation",
                  id: "a1|tier_critical",
                  label: "Escalate immediately",
                  attributes: {},
                },
              },
            ],
          });
        }
        return HttpResponse.json({
          entity: { kind: "triggered_agent", id: "a1|gas_risk", label: "Gas Risk", attributes: {} },
          neighbors: [
            {
              edge: {
                source_kind: "triggered_agent",
                source_id: "a1|gas_risk",
                relation: "evidence",
                target_kind: "sensor",
                target_id: "sensor-1",
                label: "CO sensor",
              },
              entity: { kind: "sensor", id: "sensor-1", label: "CO sensor", attributes: {} },
            },
          ],
        });
      }),
    );

    const onHighlightEdges = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <JudgeModePlayer
        assessment={assessment}
        onHighlightEdges={onHighlightEdges}
        onFocusEntity={vi.fn()}
      />,
    );

    await waitFor(() => expect(screen.getByText("Sensor evidence")).toBeInTheDocument());
    expect(screen.getByText("Contributing agent")).toBeInTheDocument();
    expect(screen.getByText("Escalate immediately")).toBeInTheDocument();

    const nextButton = screen.getByRole("button", { name: /Next/ });
    await user.click(nextButton);

    await waitFor(() =>
      expect(onHighlightEdges).toHaveBeenLastCalledWith(
        new Set([
          "triggered_agent:a1|gas_risk->sensor:sensor-1:evidence",
          "risk_assessment:a1->triggered_agent:a1|gas_risk:triggered",
        ]),
      ),
    );
  });
});
