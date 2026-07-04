import type { RiskAssessment, Tier, Zone } from "../api/types";
import { zoneLabel } from "./format";
import { parseJustification } from "./justification";

export interface JournalEntry {
  zoneId: string;
  assessment: RiskAssessment;
}

export interface JournalFilters {
  tier?: Tier;
  zoneId?: string;
  search?: string;
}

/** Newest-first, matching the "log" metaphor a decision journal implies -
 * every entry is an already-persisted `RiskAssessment`, never recomputed. */
export function sortJournalEntriesByTimestampDesc(entries: JournalEntry[]): JournalEntry[] {
  return [...entries].sort(
    (a, b) => new Date(b.assessment.timestamp).getTime() - new Date(a.assessment.timestamp).getTime(),
  );
}

/** Item 3 (Decision Journal) - search matches the zone's own name and
 * every rule identifier the persisted justification actually fired,
 * never a fuzzy/derived summary. Tier and zone filters are exact
 * matches against fields the backend already returned. */
export function filterJournalEntries(
  entries: JournalEntry[],
  zones: Zone[] | undefined,
  filters: JournalFilters,
): JournalEntry[] {
  const search = filters.search?.trim().toLowerCase();

  return entries.filter((entry) => {
    if (filters.tier && entry.assessment.tier !== filters.tier) {
      return false;
    }
    if (filters.zoneId && entry.zoneId !== filters.zoneId) {
      return false;
    }
    if (search) {
      const name = zoneLabel(entry.zoneId, zones).toLowerCase();
      const justification = parseJustification(entry.assessment.justification);
      const rules = justification?.rulesFired.join(" ").toLowerCase() ?? "";
      if (!name.includes(search) && !rules.includes(search)) {
        return false;
      }
    }
    return true;
  });
}
