import { useEffect, useRef, useState } from "react";

import { formatTimestamp } from "../../lib/format";

function useFps(active: boolean): number {
  const [fps, setFps] = useState(0);
  const frameCountRef = useRef(0);
  const lastSampleRef = useRef(performance.now());
  const frameRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!active) {
      return;
    }
    function tick(now: number) {
      frameCountRef.current += 1;
      const elapsed = now - lastSampleRef.current;
      if (elapsed >= 500) {
        setFps(Math.round((frameCountRef.current * 1000) / elapsed));
        frameCountRef.current = 0;
        lastSampleRef.current = now;
      }
      frameRef.current = requestAnimationFrame(tick);
    }
    frameRef.current = requestAnimationFrame(tick);
    return () => {
      if (frameRef.current !== undefined) {
        cancelAnimationFrame(frameRef.current);
      }
    };
  }, [active]);

  return fps;
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

/**
 * Part 4 (Demo Overlay) - a debug/presenter HUD, toggled by the `D`
 * key (listener lives in `PresentationModePage`, which owns the
 * `visible` state this component just renders). Every field here is
 * already-known page state (scene index/title, elapsed/remaining
 * timers, the shared `ReplayContext`'s own cursor) or a genuine
 * client-side measurement (FPS) - nothing here is fabricated replay
 * data.
 */
export function PresentationHud({
  visible,
  sceneTitle,
  sceneIndex,
  sceneCount,
  elapsedMs,
  remainingMs,
  replayTick,
  replayTickCount,
  replayTimestamp,
  currentZoneName,
}: {
  visible: boolean;
  sceneTitle: string;
  sceneIndex: number;
  sceneCount: number;
  elapsedMs: number;
  remainingMs: number;
  replayTick: number | null;
  replayTickCount: number | null;
  replayTimestamp: string | null;
  currentZoneName: string | null;
}) {
  const fps = useFps(visible);

  if (!visible) {
    return null;
  }

  return (
    <div className="presentation-hud" aria-label="Presentation debug HUD">
      <dl>
        <dt>Scene</dt>
        <dd>
          {sceneIndex + 1}/{sceneCount} &middot; {sceneTitle}
        </dd>
        <dt>Elapsed</dt>
        <dd>{formatDuration(elapsedMs)}</dd>
        <dt>Remaining</dt>
        <dd>{formatDuration(remainingMs)}</dd>
        <dt>FPS</dt>
        <dd>{fps}</dd>
        <dt>Replay tick</dt>
        <dd>
          {replayTick !== null && replayTickCount !== null
            ? `${replayTick + 1}/${replayTickCount}${replayTimestamp ? ` (${formatTimestamp(replayTimestamp)})` : ""}`
            : "—"}
        </dd>
        <dt>Zone</dt>
        <dd>{currentZoneName ?? "—"}</dd>
      </dl>
    </div>
  );
}
