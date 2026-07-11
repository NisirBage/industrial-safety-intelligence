import { QueryResult } from "../common/QueryResult";
import { useHistoricalDecks } from "../../hooks/useHistoricalDecks";

/**
 * M24 Part 2/10 (deck explorer) - every real deck this platform has
 * incident data for. Currently exactly one honest deck ("Demo Plant
 * Incidents") wrapping the platform's own 3 real scenarios - see
 * src/historical/decks.py for why this is not fabricated
 * industry-labeled decks. Selecting a deck scopes matches/analytics
 * to it; "All decks" (the default, `deckKey === undefined`) searches
 * every deck.
 */
export function DeckExplorer({
  selectedDeckKey,
  onSelectDeckKey,
}: {
  selectedDeckKey: string | undefined;
  onSelectDeckKey: (deckKey: string | undefined) => void;
}) {
  const { data: decks, isLoading, error, refetch } = useHistoricalDecks();

  return (
    <div className="card historical-deck-explorer">
      <h3>Historical Decks</h3>
      <QueryResult
        isLoading={isLoading}
        error={error}
        isEmpty={(decks ?? []).length === 0}
        emptyLabel="No historical decks are configured yet."
        onRetry={() => void refetch()}
      >
        <div className="historical-deck-list">
          <button
            type="button"
            className={`historical-deck-card${selectedDeckKey === undefined ? " historical-deck-card-selected" : ""}`}
            onClick={() => onSelectDeckKey(undefined)}
          >
            <strong>All decks</strong>
            <p className="kpi-sub">Search every historical incident on record.</p>
          </button>
          {decks?.map((deck) => (
            <button
              type="button"
              key={deck.key}
              className={`historical-deck-card${selectedDeckKey === deck.key ? " historical-deck-card-selected" : ""}`}
              onClick={() => onSelectDeckKey(deck.key)}
            >
              <strong>{deck.name}</strong>
              <p className="kpi-sub">{deck.description}</p>
              <p className="kpi-sub">{deck.incidents.length} incident(s)</p>
            </button>
          ))}
        </div>
      </QueryResult>
    </div>
  );
}
