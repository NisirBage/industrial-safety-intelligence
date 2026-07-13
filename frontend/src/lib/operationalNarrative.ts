import type { RiskAssessment } from "../api/types";
import { businessStoryLine } from "./executiveExplanation";
import { parseJustification } from "./justification";

/**
 * M28 Part 3 (Operational Narrative) - "instead of only charts", a
 * plain-English, timestamped sentence per meaningful tick. Every
 * sentence is `businessStoryLine` (M23 Part 6), already a fixed
 * template over real, already-persisted `tier`/`justification`
 * fields - never an LLM, never a new computation. This module only
 * applies that same per-tick function across a timeline and collapses
 * consecutive ticks that would produce the identical sentence, so a
 * long plateau at one tier doesn't repeat the same line dozens of
 * times.
 */
export interface NarrativeEntry {
  timestamp: string;
  sentence: string;
}

export function buildOperationalNarrative(timelineAscending: RiskAssessment[]): NarrativeEntry[] {
  const entries: NarrativeEntry[] = [];
  let lastSentence: string | null = null;

  for (const assessment of timelineAscending) {
    const justification = parseJustification(assessment.justification);
    const sentence = businessStoryLine(assessment, justification);
    if (sentence !== lastSentence) {
      entries.push({ timestamp: assessment.timestamp, sentence });
      lastSentence = sentence;
    }
  }

  return entries;
}
