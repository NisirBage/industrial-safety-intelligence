import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { renderWithProviders } from "../../test/renderWithProviders";
import { GlobalSearch } from "./GlobalSearch";

describe("GlobalSearch", () => {
  it("is hidden until Ctrl+K is pressed", () => {
    renderWithProviders(<GlobalSearch />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("opens on Ctrl+K, searches, and closes on Escape", async () => {
    const user = userEvent.setup();
    renderWithProviders(<GlobalSearch />);

    await user.keyboard("{Control>}k{/Control}");
    expect(screen.getByRole("dialog", { name: "Enterprise search" })).toBeInTheDocument();

    const input = screen.getByPlaceholderText(/Search zones, sensors, permits/);
    await user.type(input, "tank");

    await waitFor(() => expect(screen.getByText("Tank Farm")).toBeInTheDocument());
    expect(screen.getByRole("heading", { name: "Zone", level: 4 })).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("finds a static recommendation by text and labels it as a vocabulary reference", async () => {
    const user = userEvent.setup();
    renderWithProviders(<GlobalSearch />);

    await user.keyboard("{Control>}k{/Control}");
    const input = screen.getByPlaceholderText(/Search zones, sensors, permits/);
    await user.type(input, "evacuate");

    await waitFor(() => expect(screen.getByText("Recommendation")).toBeInTheDocument());
    expect(screen.getByText(/not a specific tick/)).toBeInTheDocument();
  });

  it("finds a cross-scenario lesson from the historical analytics aggregate", async () => {
    const user = userEvent.setup();
    renderWithProviders(<GlobalSearch />);

    await user.keyboard("{Control>}k{/Control}");
    const input = screen.getByPlaceholderText(/Search zones, sensors, permits/);
    await user.type(input, "dwell time");

    await waitFor(() => expect(screen.getByText("Lesson")).toBeInTheDocument());
    expect(screen.getByText(/Escalations that hold past dwell time are real/)).toBeInTheDocument();
  });

  it("finds a scenario's representative counterfactual moment", async () => {
    const user = userEvent.setup();
    renderWithProviders(<GlobalSearch />);

    await user.keyboard("{Control>}k{/Control}");
    const input = screen.getByPlaceholderText(/Search zones, sensors, permits/);
    await user.type(input, "counterfactual");

    await waitFor(() => expect(screen.getByText("Counterfactual")).toBeInTheDocument());
  });
});
