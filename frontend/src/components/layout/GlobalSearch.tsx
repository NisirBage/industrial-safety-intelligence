import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import type { EnterpriseSearchResult } from "../../lib/enterpriseSearch";
import {
  graphEntityToSearchResult,
  searchAnalyticsLessonsAndHazards,
  searchBusinessImpacts,
  searchCounterfactuals,
  searchEvents,
  searchForecasts,
  searchPermits,
  searchRecommendationTemplates,
  searchStandards,
} from "../../lib/enterpriseSearch";
import { useGraphSearch } from "../../hooks/useGraphSearch";
import { usePermits } from "../../hooks/usePermits";
import { useSmartSearchExtensions } from "../../hooks/useSmartSearchExtensions";
import { useZones } from "../../hooks/useZones";

/**
 * M27 Part 3 (Enterprise Search) - one global command palette (Ctrl+K
 * / Cmd+K) searching every category this platform can search without
 * scanning unbounded per-tick history (see enterpriseSearch.ts's own
 * docstring for exactly which categories that excludes, and why).
 * Every result deep-links somewhere real (Part 10) - its own page for
 * a Zone/Permit, or the Knowledge Graph focused on that exact node for
 * everything else.
 */
export function GlobalSearch() {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setIsOpen((open) => !open);
      }
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus();
    } else {
      setQuery("");
    }
  }, [isOpen]);

  const graphSearch = useGraphSearch(isOpen ? query : "");
  const { data: zones } = useZones();
  const { data: permits } = usePermits({ limit: 100 });
  const { moments, analytics, isLoading: isSmartSearchLoading } = useSmartSearchExtensions(isOpen);

  const results = useMemo<EnterpriseSearchResult[]>(() => {
    if (!query.trim()) {
      return [];
    }
    const graphResults = (graphSearch.data?.results ?? [])
      .map(graphEntityToSearchResult)
      .filter((r): r is EnterpriseSearchResult => r !== null);
    const permitResults = searchPermits(permits?.items ?? [], zones, query);
    const recommendationResults = searchRecommendationTemplates(query);
    const standardResults = searchStandards(query);
    const analyticsResults = searchAnalyticsLessonsAndHazards(analytics, query);
    const eventResults = searchEvents(moments, zones, query);
    const counterfactualResults = searchCounterfactuals(moments, zones, query);
    const forecastResults = searchForecasts(moments, zones, query);
    const businessImpactResults = searchBusinessImpacts(moments, zones, query);
    return [
      ...graphResults,
      ...permitResults,
      ...recommendationResults,
      ...standardResults,
      ...analyticsResults,
      ...eventResults,
      ...counterfactualResults,
      ...forecastResults,
      ...businessImpactResults,
    ];
  }, [graphSearch.data, permits, zones, query, analytics, moments]);

  const grouped = useMemo(() => {
    const groups = new Map<string, EnterpriseSearchResult[]>();
    for (const result of results) {
      const bucket = groups.get(result.category) ?? [];
      bucket.push(result);
      groups.set(result.category, bucket);
    }
    return groups;
  }, [results]);

  function handleSelect(result: EnterpriseSearchResult) {
    setIsOpen(false);
    navigate(result.deepLink);
  }

  if (!isOpen) {
    return null;
  }

  return (
    <div className="global-search-overlay" onClick={() => setIsOpen(false)}>
      <div
        className="global-search-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Enterprise search"
        onClick={(event) => event.stopPropagation()}
      >
        <input
          ref={inputRef}
          type="search"
          className="global-search-input"
          placeholder="Search zones, sensors, permits, lessons, forecasts, standards, incidents…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <div className="global-search-results">
          {query.trim() === "" && (
            <p className="global-search-hint">Type to search across the entire platform.</p>
          )}
          {query.trim() !== "" && results.length === 0 && isSmartSearchLoading && (
            <p className="global-search-hint">Searching…</p>
          )}
          {query.trim() !== "" && results.length === 0 && !isSmartSearchLoading && (
            <p className="global-search-hint">No matches.</p>
          )}
          {[...grouped.entries()].map(([category, categoryResults]) => (
            <div key={category} className="global-search-group">
              <h4>{category}</h4>
              <ul>
                {categoryResults.map((result) => (
                  <li key={`${result.category}:${result.id}`}>
                    <button type="button" onClick={() => handleSelect(result)}>
                      <span className="global-search-result-label">{result.label}</span>
                      <span className="global-search-result-detail">{result.detail}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <p className="global-search-footer">Esc to close &middot; Ctrl+K / Cmd+K to toggle</p>
      </div>
    </div>
  );
}
