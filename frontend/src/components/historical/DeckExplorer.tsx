import { QueryResult } from "../common/QueryResult";
import { useHistoricalDecks } from "../../hooks/useHistoricalDecks";

/**
 * M24 Part 2/10 (deck explorer) - every deck this platform has
 * registered. M28 Part 10 (Multi-Deck Evolution) added 6 industry
 * decks (Oil Refinery, Steel, Chemical, Mining, Power, LNG) alongside
 * the one real "Demo Plant Incidents" deck, to prove the deck system
 * is genuinely industry-generic rather than hardcoded to one deck -
 * but this platform still only has real incident data for that one
 * deck, so the other 6 are honestly marked "Roadmap" (a dashed pill,
 * the same disclosure pattern `PlantMap.tsx`'s "Wind overlay
 * (Roadmap)" legend entry already uses) rather than showing a
 * misleading "0 incidents" with no explanation. See
 * src/historical/decks.py for why none of this is fabricated.
 * Selecting a deck scopes matches/analytics to it; "All decks" (the
 * default, `deckKey === undefined`) searches every deck.
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
              <strong>
                {deck.name}
                {deck.incidents.length === 0 && (
                  <span
                    className="historical-deck-roadmap-badge"
                    title="Structure supported - no incident data modeled yet."
                  >
                    Roadmap
                  </span>
                )}
              </strong>
              <p className="kpi-sub">{deck.description}</p>
              <p className="kpi-sub">{deck.incidents.length} incident(s)</p>
            </button>
          ))}
        </div>
      </QueryResult>
    </div>
  );
}
