import { useRef, useState } from "react";

export interface TimelineEvent {
  id: string;
  kind: "sensor" | "permit";
  name: string;
  simTime: number;
  durationMinutes: number;
}

const PIXELS_PER_MINUTE = 4;
const MIN_TRACK_WIDTH = 400;
const ROW_HEIGHT = 40;

/**
 * Item 3 (editable timeline) - drag an event bar to change its start
 * time, drag its right edge to resize duration, delete it entirely.
 * Purely client-side draft state: every change here only edits the
 * in-memory `ScenarioDefinitionDraft` the parent page owns - nothing
 * is persisted until the user presses Execute.
 */
export function TimelineEditor({
  events,
  onMove,
  onResize,
  onDelete,
}: {
  events: TimelineEvent[];
  onMove: (id: string, simTime: number) => void;
  onResize: (id: string, durationMinutes: number) => void;
  onDelete: (id: string) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<{
    id: string;
    mode: "move" | "resize";
    startX: number;
    startSimTime: number;
    startDuration: number;
  } | null>(null);

  const maxEnd = Math.max(MIN_TRACK_WIDTH / PIXELS_PER_MINUTE, ...events.map((e) => e.simTime + e.durationMinutes), 1);
  const trackWidth = Math.max(MIN_TRACK_WIDTH, maxEnd * PIXELS_PER_MINUTE);

  function handlePointerDown(
    event: React.PointerEvent,
    id: string,
    mode: "move" | "resize",
    simTime: number,
    durationMinutes: number,
  ) {
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging({ id, mode, startX: event.clientX, startSimTime: simTime, startDuration: durationMinutes });
  }

  function handlePointerMove(event: React.PointerEvent) {
    if (!dragging) {
      return;
    }
    const deltaMinutes = (event.clientX - dragging.startX) / PIXELS_PER_MINUTE;
    if (dragging.mode === "move") {
      onMove(dragging.id, Math.max(0, Math.round(dragging.startSimTime + deltaMinutes)));
    } else {
      onResize(dragging.id, Math.max(1, Math.round(dragging.startDuration + deltaMinutes)));
    }
  }

  function handlePointerUp() {
    setDragging(null);
  }

  return (
    <div className="timeline-editor">
      {events.length === 0 ? (
        <p>No events yet - add a sensor or permit event to see it on the timeline.</p>
      ) : (
        <div
          ref={trackRef}
          className="timeline-track"
          style={{ width: `${trackWidth}px`, height: `${events.length * ROW_HEIGHT}px` }}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
        >
          {events.map((event, index) => (
            <div
              key={event.id}
              className={`timeline-event timeline-event-${event.kind}`}
              style={{
                left: `${event.simTime * PIXELS_PER_MINUTE}px`,
                width: `${event.durationMinutes * PIXELS_PER_MINUTE}px`,
                top: `${index * ROW_HEIGHT}px`,
              }}
              onPointerDown={(e) => handlePointerDown(e, event.id, "move", event.simTime, event.durationMinutes)}
              role="button"
              tabIndex={0}
              aria-label={`${event.name}: starts at ${event.simTime} minutes, lasts ${event.durationMinutes} minutes`}
            >
              <span className="timeline-event-label">{event.name}</span>
              <button
                type="button"
                className="timeline-event-delete"
                aria-label={`Delete ${event.name}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(event.id);
                }}
              >
                &times;
              </button>
              <div
                className="timeline-event-resize-handle"
                role="button"
                tabIndex={0}
                aria-label={`Resize ${event.name}`}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  handlePointerDown(e, event.id, "resize", event.simTime, event.durationMinutes);
                }}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
