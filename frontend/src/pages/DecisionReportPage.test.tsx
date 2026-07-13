import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { renderWithProviders } from "../test/renderWithProviders";
import { DecisionReportPage } from "./DecisionReportPage";

describe("DecisionReportPage report templates", () => {
  it("defaults to the Executive Report and lets an operator switch templates", async () => {
    const user = userEvent.setup();
    renderWithProviders(<DecisionReportPage />, {
      initialRoute: "/decision-report/a1",
      routePath: "/decision-report/:assessmentId",
    });

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Export Executive Report to PDF/ })).toBeInTheDocument(),
    );
    expect(screen.getByText(/Business impact and outcome/)).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Report template"), "maintenance");

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Export Maintenance Report to PDF/ })).toBeInTheDocument(),
    );
    expect(screen.getByText(/Equipment state and related risk/)).toBeInTheDocument();
    expect(screen.getByText(/Digital Twin Snapshot/)).toBeInTheDocument();
  });
});
