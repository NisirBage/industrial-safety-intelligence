import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { GraphEdge, GraphEntity } from "../api/types";
import { renderWithProviders } from "../test/renderWithProviders";
import { KnowledgeGraphPage } from "./KnowledgeGraphPage";

// GraphCanvas wraps @xyflow/react, which needs a real ResizeObserver
// and layout measurement jsdom doesn't provide. This page's own
// wiring (selection, tabs, expansion) doesn't depend on how React
// Flow renders nodes, so a lightweight stub exercises the same
// `onSelectNode` contract without pulling React Flow into jsdom.
vi.mock("../components/graph/GraphCanvas", () => ({
  GraphCanvas: ({
    nodes,
    onSelectNode,
  }: {
    nodes: GraphEntity[];
    edges: GraphEdge[];
    onSelectNode: (entity: GraphEntity) => void;
  }) => (
    <div data-testid="graph-canvas-stub">
      {nodes.map((node) => (
        <button key={`${node.kind}:${node.id}`} type="button" onClick={() => onSelectNode(node)}>
          {node.kind}:{node.label}
        </button>
      ))}
    </div>
  ),
}));

describe("KnowledgeGraphPage", () => {
  it("loads the plant root's one-hop neighborhood and shows an empty inspector until a node is selected", async () => {
    renderWithProviders(<KnowledgeGraphPage />);

    await waitFor(() => expect(screen.getByTestId("graph-canvas-stub")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "sensor:CO sensor" })).toBeInTheDocument();
    expect(screen.getByText("Select a node to inspect it.")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Root Cause" })).toBeDisabled();
    expect(screen.getByRole("tab", { name: "Explain This Decision" })).toBeDisabled();
  });

  it("selecting a node populates the inspector and enables Root Cause navigation", async () => {
    const user = userEvent.setup();
    renderWithProviders(<KnowledgeGraphPage />);

    await waitFor(() => expect(screen.getByRole("button", { name: "sensor:CO sensor" })).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "sensor:CO sensor" }));

    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "CO sensor" })).toBeInTheDocument(),
    );
    expect(screen.getByRole("tab", { name: "Root Cause" })).toBeEnabled();

    await user.click(screen.getByRole("tab", { name: "Root Cause" }));
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Root Cause Navigation" })).toBeInTheDocument(),
    );
  });

  it("keeps the Explain This Decision tab disabled for non-Risk-Assessment nodes", async () => {
    const user = userEvent.setup();
    renderWithProviders(<KnowledgeGraphPage />);

    await waitFor(() => expect(screen.getByRole("button", { name: "sensor:CO sensor" })).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "sensor:CO sensor" }));

    expect(screen.getByRole("tab", { name: "Explain This Decision" })).toBeDisabled();
  });
});
