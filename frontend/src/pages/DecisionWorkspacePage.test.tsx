import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { renderWithProviders } from "../test/renderWithProviders";
import { DecisionWorkspacePage } from "./DecisionWorkspacePage";

describe("DecisionWorkspacePage", () => {
  it("shows the Situation stage by default and lets an operator switch stages", async () => {
    renderWithProviders(<DecisionWorkspacePage />, {
      initialRoute: "/decision-workspace/a1",
      routePath: "/decision-workspace/:assessmentId",
    });

    await waitFor(() =>
      expect(screen.getByRole("heading", { level: 3, name: "Situation" })).toBeInTheDocument(),
    );
    expect(screen.getByText(/Escalating|Shutdown recommended|Tier holding/)).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Evidence" }));

    await waitFor(() => expect(screen.getByText("Rules fired")).toBeInTheDocument());
  });

  it("lets an operator acknowledge the decision locally and undo it", async () => {
    const user = userEvent.setup();
    renderWithProviders(<DecisionWorkspacePage />, {
      initialRoute: "/decision-workspace/a1",
      routePath: "/decision-workspace/:assessmentId",
    });

    await waitFor(() =>
      expect(screen.getByRole("heading", { level: 3, name: "Situation" })).toBeInTheDocument(),
    );
    await user.click(screen.getByRole("button", { name: "Approval" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Mark as reviewed" })).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "Mark as reviewed" }));

    await waitFor(() => expect(screen.getByText(/Acknowledged at/)).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "Undo acknowledgment" }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Mark as reviewed" })).toBeInTheDocument(),
    );
  });
});
