/**
 * M28 Part 1 (Decision Workspace - "Approval" stage). This platform
 * has no backend write path for "an operator approved this decision" -
 * the audit trail (M6) is a system-generated, hash-chained record of
 * what the deterministic engine itself did, not a place for a new,
 * arbitrary write path invented by this presentation-only milestone.
 * So "Approval" here is honestly scoped: a browser-local
 * acknowledgment (sessionStorage, one entry per assessment), never
 * claimed to be part of the persistent audit trail. It disappears
 * when the browser session ends, same as sessionStorage always does -
 * that honesty is the point, not a limitation to hide.
 */
export interface DecisionAcknowledgment {
  acknowledgedAtIso: string;
  note: string;
}

const STORAGE_PREFIX = "isip.decision-ack.";

function storageKey(assessmentId: string): string {
  return `${STORAGE_PREFIX}${assessmentId}`;
}

export function getLocalAcknowledgment(assessmentId: string): DecisionAcknowledgment | null {
  const raw = sessionStorage.getItem(storageKey(assessmentId));
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as DecisionAcknowledgment;
    if (typeof parsed.acknowledgedAtIso === "string" && typeof parsed.note === "string") {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

export function setLocalAcknowledgment(
  assessmentId: string,
  note: string,
  acknowledgedAtIso: string,
): DecisionAcknowledgment {
  const entry: DecisionAcknowledgment = { acknowledgedAtIso, note };
  sessionStorage.setItem(storageKey(assessmentId), JSON.stringify(entry));
  return entry;
}

export function clearLocalAcknowledgment(assessmentId: string): void {
  sessionStorage.removeItem(storageKey(assessmentId));
}
