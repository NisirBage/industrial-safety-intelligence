import type { Tier } from "../../api/types";

/** Purely presentational - maps an already-computed tier string to a
 * label/colour class. Never derives a tier from a score; the tier
 * always comes from the API response. */
export function TierBadge({ tier }: { tier: Tier | string }) {
  return <span className={`tier-badge tier-${tier}`}>{tier}</span>;
}
