import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";

import { server } from "../../test/mocks/server";
import { renderWithProviders } from "../../test/renderWithProviders";
import { PathExplorer } from "./PathExplorer";

async function pickEntity(user: ReturnType<typeof userEvent.setup>, input: HTMLElement) {
  await user.type(input, "tank");
  const option = await screen.findByRole("button", { name: /^zone\s*Tank Farm$/ });
  await user.click(option);
}

describe("PathExplorer", () => {
  it("lets the user pick a source and target, then shows the real edge chain between them", async () => {
    const onSelectRef = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(<PathExplorer onSelectRef={onSelectRef} />);

    const [fromInput, toInput] = screen.getAllByPlaceholderText(/Search zones/);
    await pickEntity(user, fromInput);
    await pickEntity(user, toInput);

    const targetButton = await screen.findByRole("button", {
      name: /^risk assessment\s*generated$/,
    });
    expect(screen.getByRole("button", { name: /^zone\s*Tank Farm$/ })).toBeInTheDocument();

    await user.click(targetButton);
    expect(onSelectRef).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "risk_assessment", id: "a1" }),
    );
  });

  it("reports no connection when the backend says the path wasn't found", async () => {
    server.use(
      http.get("http://localhost:8000/api/v1/graph/path", () =>
        HttpResponse.json({ found: false, edges: [] }),
      ),
    );
    const user = userEvent.setup();
    renderWithProviders(<PathExplorer onSelectRef={vi.fn()} />);

    const [fromInput, toInput] = screen.getAllByPlaceholderText(/Search zones/);
    await pickEntity(user, fromInput);
    await pickEntity(user, toInput);

    await waitFor(() => expect(screen.getByText(/no connection found/i)).toBeInTheDocument());
  });
});
