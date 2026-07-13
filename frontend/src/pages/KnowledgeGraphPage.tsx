import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";

import { getGraphEntity, getGraphNeighbors } from "../api/graph";
import type { GraphEdge, GraphEntity } from "../api/types";
import { GraphBreadcrumbs } from "../components/graph/GraphBreadcrumbs";
import { GraphCanvas } from "../components/graph/GraphCanvas";
import { GraphSearchBar } from "../components/graph/GraphSearchBar";
import { JudgeModePlayer } from "../components/graph/JudgeModePlayer";
import { NodeInspector } from "../components/graph/NodeInspector";
import { PathExplorer } from "../components/graph/PathExplorer";
import { RootCauseNavigator } from "../components/graph/RootCauseNavigator";
import { QueryResult } from "../components/common/QueryResult";
import { useGraphEntity } from "../hooks/useGraphEntity";
import { useGraphSubgraph } from "../hooks/useGraphSubgraph";
import { edgeKey, nodeKey } from "../lib/graphLayout";

const PLANT_KIND = "plant";
const PLANT_ID = "plant";
const INITIAL_DEPTH = 1;

type InspectorPanel = "inspector" | "path" | "root_cause" | "judge_mode";

function mergeGraphs(
  base: { nodes: GraphEntity[]; edges: GraphEdge[] },
  addition: { nodes: GraphEntity[]; edges: GraphEdge[] },
): { nodes: GraphEntity[]; edges: GraphEdge[] } {
  const nodeMap = new Map(base.nodes.map((node) => [nodeKey(node.kind, node.id), node]));
  for (const node of addition.nodes) {
    nodeMap.set(nodeKey(node.kind, node.id), node);
  }
  const edgeMap = new Map(base.edges.map((edge) => [edgeKey(edge), edge]));
  for (const edge of addition.edges) {
    edgeMap.set(edgeKey(edge), edge);
  }
  return { nodes: [...nodeMap.values()], edges: [...edgeMap.values()] };
}

/**
 * M26 Part 5/6 (Operational Knowledge Graph) - the page ties the
 * canvas, inspector, search, and breadcrumbs together. It never
 * renders the whole graph: it starts from a one-hop neighborhood of
 * the Plant root (Part 14 - lazy, bounded initial view) and only
 * fetches further neighbors when the operator explicitly expands a
 * node, merging the result into the displayed subgraph in memory.
 */
export function KnowledgeGraphPage() {
  const queryClient = useQueryClient();
  const plantQuery = useGraphEntity(PLANT_KIND, PLANT_ID);
  const subgraphQuery = useGraphSubgraph(PLANT_KIND, PLANT_ID, { depth: INITIAL_DEPTH });

  const [rootEntity, setRootEntity] = useState<GraphEntity | null>(null);
  const [breadcrumbs, setBreadcrumbs] = useState<GraphEntity[]>([]);
  const [selectedEntity, setSelectedEntity] = useState<GraphEntity | null>(null);
  const [extra, setExtra] = useState<{ nodes: GraphEntity[]; edges: GraphEdge[] }>({
    nodes: [],
    edges: [],
  });
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());
  const [activePanel, setActivePanel] = useState<InspectorPanel>("inspector");
  const [highlightedEdgeIds, setHighlightedEdgeIds] = useState<Set<string>>(new Set());
  // Captured once when Judge Mode is opened, so stepping through the
  // explanation (which moves `selectedEntity` off the Risk Assessment
  // to narrate its sensors/agents/etc.) never unmounts the player.
  const [judgeModeAssessment, setJudgeModeAssessment] = useState<GraphEntity | null>(null);

  const effectiveRoot = rootEntity ?? plantQuery.data ?? null;

  const combined = useMemo(() => {
    const base = {
      nodes: subgraphQuery.data?.nodes ?? [],
      edges: subgraphQuery.data?.edges ?? [],
    };
    return mergeGraphs(base, extra);
  }, [subgraphQuery.data, extra]);

  const handleExpand = useCallback(
    async (entity: GraphEntity) => {
      const key = nodeKey(entity.kind, entity.id);
      if (expandedKeys.has(key)) {
        return;
      }
      const neighbors = await queryClient.fetchQuery({
        queryKey: ["graph", "neighbors", entity.kind, entity.id],
        queryFn: () => getGraphNeighbors(entity.kind, entity.id),
        staleTime: 5 * 60 * 1000,
      });
      setExtra((prev) =>
        mergeGraphs(prev, {
          nodes: neighbors.neighbors.map((n) => n.entity),
          edges: neighbors.neighbors.map((n) => n.edge),
        }),
      );
      setExpandedKeys((prev) => new Set(prev).add(key));
    },
    [expandedKeys, queryClient],
  );

  const handleRecenter = useCallback(
    (entity: GraphEntity) => {
      if (effectiveRoot) {
        setBreadcrumbs((prev) => [...prev, effectiveRoot]);
      }
      setRootEntity(entity);
      setSelectedEntity(entity);
      setExtra({ nodes: [], edges: [] });
      setExpandedKeys(new Set());
      setHighlightedEdgeIds(new Set());
      setJudgeModeAssessment(null);
      void handleExpand(entity);
    },
    [effectiveRoot, handleExpand],
  );

  const handleBreadcrumbSelect = useCallback((entity: GraphEntity, index: number) => {
    setBreadcrumbs((prev) => prev.slice(0, index));
    setRootEntity(entity);
    setSelectedEntity(entity);
    setExtra({ nodes: [], edges: [] });
    setExpandedKeys(new Set());
    setHighlightedEdgeIds(new Set());
    setJudgeModeAssessment(null);
  }, []);

  const handleSelectAndExpand = useCallback(
    (entity: GraphEntity) => {
      setSelectedEntity(entity);
      setHighlightedEdgeIds(new Set());
      void handleExpand(entity);
    },
    [handleExpand],
  );

  const handleFocus = useCallback(
    (entity: GraphEntity) => {
      setSelectedEntity(entity);
      void handleExpand(entity);
    },
    [handleExpand],
  );

  const handleSelectRef = useCallback(
    async (ref: GraphEntity) => {
      const entity = await queryClient.fetchQuery({
        queryKey: ["graph", "entity", ref.kind, ref.id],
        queryFn: () => getGraphEntity(ref.kind, ref.id),
      });
      handleSelectAndExpand(entity);
    },
    [queryClient, handleSelectAndExpand],
  );

  const rootKey = effectiveRoot ? nodeKey(effectiveRoot.kind, effectiveRoot.id) : "";
  const trail = effectiveRoot ? [...breadcrumbs, effectiveRoot] : breadcrumbs;

  // M27 Part 10 (Search deep-links) - `?focus=kind:id` recenters the
  // graph on a specific entity on load (e.g. from Enterprise Search),
  // instead of always starting at the Plant root. Applied at most
  // once per page load - after that, in-page navigation (breadcrumbs,
  // search, node clicks) is the only thing that moves the root.
  const [searchParams] = useSearchParams();
  const appliedFocusRef = useRef(false);
  useEffect(() => {
    if (appliedFocusRef.current) {
      return;
    }
    const focus = searchParams.get("focus");
    if (!focus) {
      return;
    }
    const separatorIndex = focus.indexOf(":");
    if (separatorIndex < 1) {
      return;
    }
    appliedFocusRef.current = true;
    const kind = focus.slice(0, separatorIndex);
    const id = focus.slice(separatorIndex + 1);
    void queryClient
      .fetchQuery({ queryKey: ["graph", "entity", kind, id], queryFn: () => getGraphEntity(kind, id) })
      .then((entity) => handleRecenter(entity))
      .catch(() => {
        // An invalid/unreachable focus target just leaves the Plant root shown - not a hard error.
      });
    // Only ever fires once per mount, guarded above - `searchParams`/`handleRecenter`
    // are intentionally excluded so a later unrelated param change never re-triggers it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <section className="graph-page">
      <h1>Operational Knowledge Graph</h1>
      <p className="page-intro">
        Every entity behind a decision - sensors, workers, permits, risk assessments,
        recommendations, historical incidents, forecasts, counterfactuals - as one navigable,
        read-only evidence graph. Nothing here recomputes a risk score or recommendation; the
        graph only connects evidence that already exists elsewhere in the platform.
      </p>

      <div className="graph-toolbar">
        <GraphSearchBar onSelect={handleRecenter} />
        <GraphBreadcrumbs trail={trail} onSelect={handleBreadcrumbSelect} />
      </div>

      <QueryResult
        isLoading={plantQuery.isLoading || subgraphQuery.isLoading}
        error={plantQuery.error ?? subgraphQuery.error}
        isEmpty={!effectiveRoot}
        emptyLabel="The knowledge graph has no data to show yet."
        onRetry={() => {
          void plantQuery.refetch();
          void subgraphQuery.refetch();
        }}
      >
        {effectiveRoot && (
          <div className="graph-layout">
            <GraphCanvas
              nodes={combined.nodes}
              edges={combined.edges}
              rootKey={rootKey}
              selectedKey={selectedEntity ? nodeKey(selectedEntity.kind, selectedEntity.id) : null}
              highlightedEdgeIds={highlightedEdgeIds}
              onSelectNode={handleSelectAndExpand}
            />
            <div className="graph-side-panel">
              <div className="graph-panel-tabs" role="tablist">
                <button
                  type="button"
                  role="tab"
                  aria-selected={activePanel === "inspector"}
                  className={activePanel === "inspector" ? "graph-panel-tab-active" : ""}
                  onClick={() => setActivePanel("inspector")}
                >
                  Inspector
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={activePanel === "path"}
                  className={activePanel === "path" ? "graph-panel-tab-active" : ""}
                  onClick={() => setActivePanel("path")}
                >
                  Path Explorer
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={activePanel === "root_cause"}
                  className={activePanel === "root_cause" ? "graph-panel-tab-active" : ""}
                  onClick={() => setActivePanel("root_cause")}
                  disabled={!selectedEntity}
                >
                  Root Cause
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={activePanel === "judge_mode"}
                  className={activePanel === "judge_mode" ? "graph-panel-tab-active" : ""}
                  onClick={() => {
                    if (selectedEntity?.kind === "risk_assessment") {
                      setJudgeModeAssessment(selectedEntity);
                    }
                    setActivePanel("judge_mode");
                  }}
                  disabled={activePanel !== "judge_mode" && selectedEntity?.kind !== "risk_assessment"}
                >
                  Explain This Decision
                </button>
              </div>

              {activePanel === "inspector" && selectedEntity && (
                <NodeInspector
                  entity={selectedEntity}
                  onSelectEntity={handleSelectAndExpand}
                  onRecenter={handleRecenter}
                />
              )}
              {activePanel === "inspector" && !selectedEntity && (
                <p className="graph-panel-empty">Select a node to inspect it.</p>
              )}

              {activePanel === "path" && <PathExplorer onSelectRef={handleSelectRef} />}

              {activePanel === "root_cause" && selectedEntity && (
                <RootCauseNavigator start={selectedEntity} onFocusEntity={handleFocus} />
              )}

              {activePanel === "judge_mode" && judgeModeAssessment && (
                <JudgeModePlayer
                  assessment={judgeModeAssessment}
                  onHighlightEdges={setHighlightedEdgeIds}
                  onFocusEntity={handleFocus}
                />
              )}
              {activePanel === "judge_mode" && !judgeModeAssessment && (
                <p className="graph-panel-empty">
                  Select a Risk Assessment node, then reopen this tab to explain its decision.
                </p>
              )}
            </div>
          </div>
        )}
      </QueryResult>
    </section>
  );
}
