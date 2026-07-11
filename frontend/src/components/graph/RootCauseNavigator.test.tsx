import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import type { GraphEntity } from "../../api/types";
import { renderWithProviders } from "../../test/renderWithProviders";
import { RootCauseNavigator } from "./RootCauseNavigator";

const ZONE_ID = "11111111-1111-1111-1111-111111111111";

const zoneEntity: GraphEntity = {
  kind: "zone",
  id: ZONE_ID,
  label: "Tank Farm",
  attributes: {},
};

describe("RootCauseNavigator", () => {
  it("shows the starting entity in the trail and its neighbors grouped by relation", async () => {
    renderWithProviders(<RootCauseNavigator start={zoneEntity} onFocusEntity={vi.fn()} />);

    await waitFor(() => expect(screen.getByText("contains")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /zone: Tank Farm/ })).toBeDisabled();
    expect(screen.getByText("CO sensor")).toBeInTheDocument();
  });

  it("drills into a neighbor, extending the trail and calling onFocusEntity", async () => {
    const onFocusEntity = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(<RootCauseNavigator start={zoneEntity} onFocusEntity={onFocusEntity} />);

    await waitFor(() => expect(screen.getByText("CO sensor")).toBeInTheDocument());
    await user.click(screen.getByText("CO sensor"));

    expect(onFocusEntity).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "sensor", id: "sensor-1" }),
    );
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /sensor: CO sensor/ })).toBeDisabled(),
    );
  });

  it("resets the trail when the start entity changes", async () => {
    const otherZone: GraphEntity = {
      kind: "zone",
      id: "zone-2",
      label: "Loading Bay",
      attributes: {},
    };

    function Harness() {
      const [start, setStart] = useState(zoneEntity);
      return (
        <>
          <button type="button" onClick={() => setStart(otherZone)}>
            Switch
          </button>
          <RootCauseNavigator start={start} onFocusEntity={vi.fn()} />
        </>
      );
    }

    const user = userEvent.setup();
    renderWithProviders(<Harness />);
    await waitFor(() => expect(screen.getByText("CO sensor")).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: "Switch" }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /zone: Loading Bay/ })).toBeDisabled(),
    );
  });
});
