import { useState } from "react";

import { useReplay } from "../../context/ReplayContext";
import { formatTimestamp } from "../../lib/format";

const SPEED_OPTIONS = [0.5, 1, 2, 5, 10];

/**
 * Item 2 (Timeline Controller) - Play/Pause/Reset/Previous
 * Tick/Next Tick/Jump To Timestamp/Playback Speed/Timeline Slider/
 * Current Tick/Current Timestamp, all driving the single
 * `ReplayContext` (item 4) - no component here keeps its own replay
 * position.
 */
export function ReplayController() {
  const replay = useReplay();
  const [jumpValue, setJumpValue] = useState("");

  if (replay.target === null) {
    return null;
  }

  if (replay.isLoading) {
    return <p>Loading replay…</p>;
  }

  if (replay.allTimestamps.length === 0) {
    return <p>No persisted assessments in this window yet.</p>;
  }

  return (
    <div className="card replay-controller">
      <div className="replay-controller-buttons">
        <button type="button" onClick={replay.reset}>
          Reset
        </button>
        <button type="button" onClick={replay.previous} disabled={replay.currentIndex === 0}>
          &larr; Previous Tick
        </button>
        <button
          type="button"
          onClick={replay.playing ? replay.pause : replay.play}
          disabled={replay.currentIndex >= replay.allTimestamps.length - 1 && !replay.playing}
        >
          {replay.playing ? "Pause" : "Play"}
        </button>
        <button
          type="button"
          onClick={replay.next}
          disabled={replay.currentIndex >= replay.allTimestamps.length - 1}
        >
          Next Tick &rarr;
        </button>
        <label>
          Speed:{" "}
          <select
            value={replay.speed}
            onChange={(event) => replay.setSpeed(Number(event.target.value))}
          >
            {SPEED_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}x
              </option>
            ))}
          </select>
        </label>
        <form
          className="replay-jump-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (jumpValue) {
              replay.jumpToTimestamp(jumpValue);
            }
          }}
        >
          <label>
            Jump to:{" "}
            <input
              type="datetime-local"
              value={jumpValue}
              onChange={(event) => setJumpValue(event.target.value)}
            />
          </label>
          <button type="submit">Jump</button>
        </form>
        <button type="button" onClick={replay.exitReplay} className="replay-exit-button">
          Exit Time Machine
        </button>
      </div>

      <input
        type="range"
        className="replay-slider"
        min={0}
        max={replay.allTimestamps.length - 1}
        value={replay.currentIndex}
        onChange={(event) => replay.scrubToIndex(Number(event.target.value))}
        aria-label="Replay timeline"
      />

      <p className="replay-cursor-readout">
        Tick {replay.currentIndex + 1} of {replay.allTimestamps.length}
        {" · "}
        {replay.currentTimestamp && formatTimestamp(replay.currentTimestamp)}
        {" · "}
        {replay.durationMinutes.toFixed(0)} min window
      </p>
    </div>
  );
}
