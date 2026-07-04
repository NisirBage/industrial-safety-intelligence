import { useQuery } from "@tanstack/react-query";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { getReplay, type ReplayTarget } from "../api/replay";
import type { ReplayBookmark, RiskAssessment } from "../api/types";
import { findNearestTimestampIndex, mergeTimestamps } from "../lib/replayTimeline";
import { assessmentAtOrBefore } from "../lib/timeline";

export interface CustomBookmark {
  id: string;
  timestamp: string;
  label: string;
}

const PLAYBACK_TICK_MS = 400;

interface ReplayContextValue {
  target: ReplayTarget | null;
  isLoading: boolean;
  error: unknown;
  zoneIds: string[];
  allTimestamps: string[];
  currentIndex: number;
  currentTimestamp: string | null;
  playing: boolean;
  speed: number;
  tickCount: number;
  durationMinutes: number;
  bookmarks: ReplayBookmark[];
  customBookmarks: CustomBookmark[];
  startReplay: (target: ReplayTarget) => void;
  exitReplay: () => void;
  play: () => void;
  pause: () => void;
  reset: () => void;
  next: () => void;
  previous: () => void;
  jumpToTimestamp: (timestamp: string) => void;
  scrubToIndex: (index: number) => void;
  setSpeed: (speed: number) => void;
  addCustomBookmark: (label: string) => void;
  /** The most recent persisted assessment at-or-before the current
   * cursor, for one zone - never an interpolated/recomputed value,
   * reusing the same step-function lookup ScenarioReplayPage already
   * established. */
  assessmentAt: (zoneId: string) => RiskAssessment | null;
  /** Every persisted assessment for one zone across the whole replay
   * window, ascending by timestamp - for views that need the full
   * history up to the cursor (Decision Evolution), not just the
   * single current-tick snapshot. */
  zoneTimeline: (zoneId: string) => RiskAssessment[];
}

const ReplayContext = createContext<ReplayContextValue | null>(null);

export function useReplay(): ReplayContextValue {
  const ctx = useContext(ReplayContext);
  if (!ctx) {
    throw new Error("useReplay must be used within a ReplayProvider");
  }
  return ctx;
}

/**
 * Item 4 (Replay State Engine) - the single source of truth for the
 * Time Machine. Fetches `GET /replay` exactly once per target
 * (`staleTime: Infinity` - persisted history never changes once
 * fetched, so scrubbing/seeking/playing never re-fetches, satisfying
 * the "1000+ ticks without unnecessary re-fetching" requirement) and
 * derives every other piece of state - the merged timestamp axis, the
 * current cursor, bookmarks - from that one payload. No other
 * component keeps its own copy of replay position.
 */
export function ReplayProvider({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<ReplayTarget | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeedState] = useState(1);
  const [customBookmarks, setCustomBookmarks] = useState<CustomBookmark[]>([]);

  const { data, isLoading, error } = useQuery({
    queryKey: ["replay", target],
    queryFn: () => getReplay(target as ReplayTarget),
    enabled: target !== null,
    staleTime: Infinity,
  });

  const allTimestamps = useMemo(() => {
    if (!data) {
      return [];
    }
    return mergeTimestamps(data.zone_timelines.map((t) => t.assessments.map((a) => a.timestamp)));
  }, [data]);

  useEffect(() => {
    setCurrentIndex(0);
    setPlaying(false);
    setCustomBookmarks([]);
  }, [target]);

  useEffect(() => {
    if (!playing || allTimestamps.length === 0) {
      return;
    }
    const id = window.setInterval(() => {
      setCurrentIndex((index) => {
        if (index >= allTimestamps.length - 1) {
          setPlaying(false);
          return index;
        }
        return index + 1;
      });
    }, PLAYBACK_TICK_MS / speed);
    return () => window.clearInterval(id);
  }, [playing, speed, allTimestamps.length]);

  const startReplay = useCallback((newTarget: ReplayTarget) => setTarget(newTarget), []);
  const exitReplay = useCallback(() => setTarget(null), []);
  const play = useCallback(() => setPlaying(true), []);
  const pause = useCallback(() => setPlaying(false), []);
  const reset = useCallback(() => {
    setPlaying(false);
    setCurrentIndex(0);
  }, []);
  const next = useCallback(() => {
    setPlaying(false);
    setCurrentIndex((index) => Math.min(index + 1, allTimestamps.length - 1));
  }, [allTimestamps.length]);
  const previous = useCallback(() => {
    setPlaying(false);
    setCurrentIndex((index) => Math.max(index - 1, 0));
  }, []);
  const scrubToIndex = useCallback(
    (index: number) => {
      setPlaying(false);
      setCurrentIndex(Math.max(0, Math.min(index, allTimestamps.length - 1)));
    },
    [allTimestamps.length],
  );
  const jumpToTimestamp = useCallback(
    (timestamp: string) => {
      setPlaying(false);
      setCurrentIndex(findNearestTimestampIndex(allTimestamps, timestamp));
    },
    [allTimestamps],
  );
  const addCustomBookmark = useCallback(
    (label: string) => {
      const currentTimestamp = allTimestamps[currentIndex];
      if (!currentTimestamp) {
        return;
      }
      setCustomBookmarks((bookmarks) => [
        ...bookmarks,
        { id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, timestamp: currentTimestamp, label },
      ]);
    },
    [allTimestamps, currentIndex],
  );

  const zoneTimeline = useCallback(
    (zoneId: string): RiskAssessment[] => {
      return data?.zone_timelines.find((t) => t.zone_id === zoneId)?.assessments ?? [];
    },
    [data],
  );

  const assessmentAt = useCallback(
    (zoneId: string): RiskAssessment | null => {
      const currentTimestamp = allTimestamps[currentIndex];
      if (currentTimestamp === undefined) {
        return null;
      }
      return assessmentAtOrBefore(zoneTimeline(zoneId), new Date(currentTimestamp).getTime());
    },
    [zoneTimeline, allTimestamps, currentIndex],
  );

  const value: ReplayContextValue = {
    target,
    isLoading,
    error,
    zoneIds: data?.zone_ids ?? [],
    allTimestamps,
    currentIndex,
    currentTimestamp: allTimestamps[currentIndex] ?? null,
    playing,
    speed,
    tickCount: data?.tick_count ?? 0,
    durationMinutes: data?.duration_minutes ?? 0,
    bookmarks: data?.bookmarks ?? [],
    customBookmarks,
    startReplay,
    exitReplay,
    play,
    pause,
    reset,
    next,
    previous,
    jumpToTimestamp,
    scrubToIndex,
    setSpeed: setSpeedState,
    addCustomBookmark,
    assessmentAt,
    zoneTimeline,
  };

  return <ReplayContext.Provider value={value}>{children}</ReplayContext.Provider>;
}
