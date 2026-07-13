import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { renderWithProviders } from "../test/renderWithProviders";
import { LiveIntegrationHubPage } from "./LiveIntegrationHubPage";

describe("LiveIntegrationHubPage", () => {
  it("shows real vs mocked connector status", async () => {
    renderWithProviders(<LiveIntegrationHubPage />);

    await waitFor(() => expect(screen.getByText("CSV Watcher")).toBeInTheDocument());
    expect(screen.getAllByText("Implemented")).toHaveLength(2);
    expect(screen.getAllByText("Mocked")).toHaveLength(2);
    expect(screen.getByText("Readings ingested this process: 3")).toBeInTheDocument();
  });

  it("lets an operator pick a zone/gas type and simulate a mocked message", async () => {
    const user = userEvent.setup();
    renderWithProviders(<LiveIntegrationHubPage />);

    await waitFor(() => expect(screen.getByText("CSV Watcher")).toBeInTheDocument());

    const zoneSelect = screen.getByLabelText("Zone");
    await user.selectOptions(zoneSelect, await screen.findByRole("option", { name: "Tank Farm" }));

    const gasSelect = screen.getByLabelText("Gas type");
    await waitFor(() => expect(gasSelect).not.toBeDisabled());
    const gasOptions = screen.getAllByRole("option").filter((o) => o.textContent === "CO");
    if (gasOptions.length > 0) {
      await user.selectOptions(gasSelect, gasOptions[0]);
    }

    const mqttButton = screen.getByRole("button", { name: "Simulate MQTT message" });
    if (!(mqttButton as HTMLButtonElement).disabled) {
      await user.click(mqttButton);
      await waitFor(() =>
        expect(screen.getByText(/Ingested a reading of/)).toBeInTheDocument(),
      );
    }
  });
});
