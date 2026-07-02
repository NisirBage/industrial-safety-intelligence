/**
 * Severity ordering for *display* purposes only (e.g. "what's the
 * worst tier currently on the plant?"). This is a UI-level presentation
 * constant, not a risk computation - it never derives a tier from a
 * score, only orders tier strings the backend already computed and
 * returned. Mirrors the backend's own `TIER_ORDER`
 * (src/domain/orchestrator/tiering.py), kept as an independent copy
 * the same way every backend module keeps its own rather than
 * importing a shared one.
 */
const TIER_ORDER = ["normal", "watch", "elevated", "critical"] as const;

export function worstTier(tiers: string[]): string | null {
  if (tiers.length === 0) {
    return null;
  }
  return tiers.reduce((worst, tier) => {
    const worstRank = TIER_ORDER.indexOf(worst as (typeof TIER_ORDER)[number]);
    const rank = TIER_ORDER.indexOf(tier as (typeof TIER_ORDER)[number]);
    return rank > worstRank ? tier : worst;
  });
}

export function latestTimestamp(timestamps: string[]): string | null {
  if (timestamps.length === 0) {
    return null;
  }
  return timestamps.reduce((latest, current) => (current > latest ? current : latest));
}
