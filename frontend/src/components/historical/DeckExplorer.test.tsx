import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "../../test/renderWithProviders";
import { DeckExplorer } from "./DeckExplorer";

describe("DeckExplorer", () => {
  it("renders every registered deck, marking empty decks as Roadmap", async () => {
    const onSelectDeckKey = vi.fn();
    renderWithProviders(<DeckExplorer selectedDeckKey={undefined} onSelectDeckKey={onSelectDeckKey} />);

    await waitFor(() => expect(screen.getByText("Demo Plant Incidents")).toBeInTheDocument());
    expect(screen.getByText("Oil Refinery")).toBeInTheDocument();
    expect(screen.getByText("Roadmap")).toBeInTheDocument();
    expect(screen.getByText("Roadmap")).toHaveAttribute(
      "title",
      "Structure supported - no incident data modeled yet.",
    );
    // The real deck must not carry the Roadmap badge.
    const realDeckCard = screen.getByText("Demo Plant Incidents").closest("button");
    expect(realDeckCard?.textContent).not.toContain("Roadmap");
  });

  it("selects a deck on click", async () => {
    const onSelectDeckKey = vi.fn();
    const user = (await import("@testing-library/user-event")).default.setup();
    renderWithProviders(<DeckExplorer selectedDeckKey={undefined} onSelectDeckKey={onSelectDeckKey} />);

    await waitFor(() => expect(screen.getByText("Oil Refinery")).toBeInTheDocument());
    await user.click(screen.getByText("Oil Refinery"));
    expect(onSelectDeckKey).toHaveBeenCalledWith("oil-refinery");
  });
});
