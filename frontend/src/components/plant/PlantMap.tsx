import { useState } from "react";

import type { Tier } from "../../api/types";
import { formatTimestamp } from "../../lib/format";
import { formatPermitType, permitTypeGlyph } from "../../lib/permitIcons";

export interface PlantMapZone {
  zoneId: string;
  name: string;
  tier: Tier;
  compoundRiskScore: number;
  confidence: number;
  timestamp: string;
  /** All optional - callers that don't have this data yet (or a zone
   * with no gas sensor, no workers, etc.) simply don't render that
   * icon/overlay, rather than showing a fabricated zero. */
  workerCount?: number;
  /** One glyph per distinct active permit type in this zone (M16 -
   * replaces the old boolean `hasActivePermit`, since a real Digital
   * Twin distinguishes Hot Work from Confined Space rather than
   * showing one generic clipboard for both). */
  activePermitTypes?: string[];
  equipmentRisk?: number;
  gasRisk?: number;
  /** The zone's monitored gas type (from `GET /zones/{id}/sensors`),
   * shown as a small sensor glyph distinct from the ambient heat wash
   * below - "there is a sensor here" is a different fact from "the
   * agent's risk score is elevated", so they get separate icons. */
  gasType?: string;
}

type ZoneShape = "tank" | "building" | "control" | "dock";

interface ZoneLayout {
  x: number;
  y: number;
  width: number;
  height: number;
  shape: ZoneShape;
}

/**
 * M11.1 - fixed site-plan positions for the five named zones this
 * milestone calls out. Purely a display layout table, not plant
 * data: whichever of these five `GET /zones` actually returns render
 * here; any zone name not in this table (or not yet seeded) falls
 * back to `FALLBACK_LAYOUT`'s grid rather than being silently dropped.
 */
const ZONE_LAYOUT: Record<string, ZoneLayout> = {
  "Tank Farm": { x: 30, y: 210, width: 150, height: 130, shape: "tank" },
  "Compressor House": { x: 230, y: 160, width: 150, height: 180, shape: "building" },
  "Boiler House": { x: 420, y: 140, width: 150, height: 200, shape: "building" },
  "Control Room": { x: 610, y: 40, width: 150, height: 100, shape: "control" },
  "Loading Bay": { x: 610, y: 250, width: 150, height: 100, shape: "dock" },
};

const FALLBACK_LAYOUT: ZoneLayout[] = [
  { x: 30, y: 40, width: 150, height: 130, shape: "building" },
  { x: 230, y: 40, width: 150, height: 130, shape: "building" },
  { x: 420, y: 40, width: 150, height: 100, shape: "building" },
];

function layoutFor(name: string, fallbackIndex: number): ZoneLayout {
  return ZONE_LAYOUT[name] ?? FALLBACK_LAYOUT[fallbackIndex % FALLBACK_LAYOUT.length];
}

function ZoneShapeSvg({ layout, tier }: { layout: ZoneLayout; tier: Tier }) {
  const { x, y, width, height, shape } = layout;
  const fillClass = `plant-zone-fill tier-fill-${tier}`;

  if (shape === "tank") {
    const tankWidth = width / 2 - 8;
    return (
      <g>
        {[0, 1].map((i) => (
          <g key={i}>
            <rect
              className={fillClass}
              x={x + i * (tankWidth + 16)}
              y={y + 20}
              width={tankWidth}
              height={height - 20}
              rx={6}
            />
            <ellipse
              className={fillClass}
              cx={x + i * (tankWidth + 16) + tankWidth / 2}
              cy={y + 20}
              rx={tankWidth / 2}
              ry={10}
            />
          </g>
        ))}
      </g>
    );
  }

  if (shape === "control") {
    return (
      <g>
        <rect className={fillClass} x={x} y={y + 15} width={width} height={height - 15} rx={4} />
        <line
          x1={x + width / 2}
          y1={y + 15}
          x2={x + width / 2}
          y2={y}
          stroke="currentColor"
          strokeWidth={2}
        />
        <circle cx={x + width / 2} cy={y} r={3} fill="currentColor" />
      </g>
    );
  }

  if (shape === "dock") {
    return (
      <g>
        <rect className={fillClass} x={x} y={y} width={width} height={height} rx={4} />
        {[0.2, 0.4, 0.6, 0.8].map((f) => (
          <line
            key={f}
            x1={x + width * f}
            y1={y + height}
            x2={x + width * f + 14}
            y2={y}
            stroke="var(--bg)"
            strokeWidth={4}
            opacity={0.5}
          />
        ))}
      </g>
    );
  }

  return (
    <g>
      <rect className={fillClass} x={x} y={y} width={width} height={height} rx={4} />
      <rect x={x + 12} y={y + 16} width={16} height={16} fill="var(--bg)" opacity={0.4} />
      <rect x={x + width - 28} y={y + 16} width={16} height={16} fill="var(--bg)" opacity={0.4} />
    </g>
  );
}

/** A small person glyph + count badge - `workerCount` comes straight
 * from `GET /zones/{zoneId}/workers/count` (M11.0), never estimated. */
function WorkerIcon({ x, y, count }: { x: number; y: number; count: number }) {
  return (
    <g className="plant-zone-icon plant-zone-icon-worker" transform={`translate(${x}, ${y})`}>
      <circle cx={0} cy={-6} r="6" />
      <path d="M -8 10 Q 0 -4 8 10 Z" />
      <text x={13} y={4} className="plant-zone-icon-badge">
        {count}
      </text>
    </g>
  );
}

/** One glyph per active permit type (from the same `/permits?status=
 * active` list every other permit view already reads) - a flame for
 * Hot Work, a hatch for Confined Space, a lightning-slash for
 * Isolation, a broken pipe for Line Break, a plain clipboard for
 * anything else. Multiple active permits in one zone stack
 * horizontally rather than collapsing to a single icon. */
function PermitIcon({ x, y, permitType }: { x: number; y: number; permitType: string }) {
  const glyph = permitTypeGlyph(permitType);
  const className = `plant-zone-icon plant-zone-icon-permit plant-zone-icon-permit-${glyph}`;

  if (glyph === "hot_work") {
    return (
      <g className={className} transform={`translate(${x}, ${y})`}>
        <title>Hot Work permit active</title>
        <path d="M 0 -11 C 4 -6 4 -2 1 0 C 3 -1 4 2 0 5 C -4 2 -3 -1 -1 0 C -4 -2 -3 -7 0 -11 Z" />
      </g>
    );
  }
  if (glyph === "confined_space") {
    return (
      <g className={className} transform={`translate(${x}, ${y})`}>
        <title>Confined Space permit active</title>
        <ellipse cx={0} cy={-3} rx={7} ry={3} />
        <path d="M -7 -3 L -4 6 L 4 6 L 7 -3" />
      </g>
    );
  }
  if (glyph === "isolation") {
    return (
      <g className={className} transform={`translate(${x}, ${y})`}>
        <title>Isolation (Electrical) permit active</title>
        <path d="M 1 -11 L -6 1 L -1 1 L -3 9 L 6 -3 L 1 -3 Z" />
      </g>
    );
  }
  if (glyph === "line_break") {
    return (
      <g className={className} transform={`translate(${x}, ${y})`}>
        <title>Line Break permit active</title>
        <line x1={-8} y1={0} x2={-2} y2={0} />
        <line x1={2} y1={0} x2={8} y2={0} />
        <circle cx={-2} cy={0} r={1.6} />
        <circle cx={2} cy={0} r={1.6} />
      </g>
    );
  }
  return (
    <g className={className} transform={`translate(${x}, ${y})`}>
      <title>{formatPermitType(permitType)} permit active</title>
      <rect x={-7} y={-9} width={14} height={18} rx={2} />
      <rect x={-3} y={-11} width={6} height={4} rx={1} />
      <line x1={-4} y1={-2} x2={4} y2={-2} />
      <line x1={-4} y1={2} x2={4} y2={2} />
    </g>
  );
}

/** A small gauge glyph pinned to any zone with a monitored gas
 * sensor - distinct from the ambient heat wash, since "a sensor is
 * here" and "the agent's risk score is elevated" are two different
 * facts. Colored by the same tier thresholds `EquipmentIcon` uses, on
 * the Gas Risk agent's own already-computed 0-100 contribution. */
function SensorIcon({ x, y, gasType, risk }: { x: number; y: number; gasType: string; risk: number }) {
  const level = risk >= 65 ? "critical" : risk >= 40 ? "elevated" : risk >= 20 ? "watch" : "normal";
  return (
    <g
      className={`plant-zone-icon plant-zone-icon-sensor plant-zone-icon-sensor-${level}`}
      transform={`translate(${x}, ${y})`}
    >
      <title>
        {gasType} sensor - agent risk {risk.toFixed(0)}
      </title>
      <circle cx={0} cy={0} r={7.5} fill="none" />
      <path d="M -4 2 L -1 -3 L 1 0 L 4 -4" fill="none" />
      <text x={0} y={16} textAnchor="middle" className="plant-zone-icon-badge">
        {gasType}
      </text>
    </g>
  );
}

/** Explains the map's colors and glyphs - opt-in (`showLegend`) so
 * existing embeddings (Overview, Time Machine) that already have
 * their own legend-adjacent text elsewhere aren't forced to grow a
 * new block; the standalone Digital Twin page turns it on. */
export function PlantMapLegend() {
  return (
    <div className="plant-map-legend" aria-label="Plant map legend">
      <div className="plant-map-legend-group">
        <span className="plant-map-legend-swatch tier-fill-normal" /> Normal
        <span className="plant-map-legend-swatch tier-fill-watch" /> Watch
        <span className="plant-map-legend-swatch tier-fill-elevated" /> Elevated
        <span className="plant-map-legend-swatch tier-fill-critical" /> Critical
      </div>
      <div className="plant-map-legend-group">
        <svg width="16" height="16" viewBox="-8 -8 16 16" aria-hidden="true">
          <g className="plant-zone-icon-worker">
            <circle cx={0} cy={-3} r="3" />
          </g>
        </svg>
        Workers
        <svg width="16" height="16" viewBox="-8 -8 16 16" aria-hidden="true">
          <g className="plant-zone-icon-equipment plant-zone-icon-equipment-normal">
            <circle cx={0} cy={0} r={5} fill="none" />
          </g>
        </svg>
        Equipment
        <svg width="16" height="16" viewBox="-8 -8 16 16" aria-hidden="true">
          <g className="plant-zone-icon-sensor plant-zone-icon-sensor-normal">
            <circle cx={0} cy={0} r={5} fill="none" />
          </g>
        </svg>
        Gas sensor
        <svg width="16" height="16" viewBox="-8 -8 16 16" aria-hidden="true">
          <g className="plant-zone-icon-permit plant-zone-icon-permit-hot_work">
            <circle cx={0} cy={0} r={5} />
          </g>
        </svg>
        Active permit (shape = type)
      </div>
      <span
        className="plant-map-legend-roadmap"
        title="Not implemented - disclosed as a future integration, not a built feature."
      >
        Wind overlay (Roadmap)
      </span>
    </div>
  );
}

/** A small gear glyph, colored by the Equipment Status agent's own
 * raw risk contribution (0-100) for this tick - not a new signal,
 * the same number the Explainability page's agent chart shows. */
function EquipmentIcon({ x, y, risk }: { x: number; y: number; risk: number }) {
  const level = risk >= 65 ? "critical" : risk >= 40 ? "elevated" : risk >= 20 ? "watch" : "normal";
  return (
    <g
      className={`plant-zone-icon plant-zone-icon-equipment plant-zone-icon-equipment-${level}`}
      transform={`translate(${x}, ${y})`}
    >
      <circle cx={0} cy={0} r={7} fill="none" />
      <circle cx={0} cy={0} r={2.5} />
      {[0, 60, 120, 180, 240, 300].map((angle) => (
        <line
          key={angle}
          x1={0}
          y1={-7}
          x2={0}
          y2={-9.5}
          transform={`rotate(${angle})`}
          strokeWidth={1.5}
        />
      ))}
    </g>
  );
}

/**
 * Item 1 (interactive plant map) - the plant rendered as an
 * industrial site plan rather than a card list. Purely presentational
 * and data-driven: every score/tier/confidence/icon shown here is
 * exactly what the caller passed in (live `/risk/current` on
 * Overview, a playback snapshot during Live Incident Playback) - this
 * component never fetches or computes anything itself, so the same
 * map can be the live view and the replay view.
 *
 * The gas-heat overlay and equipment/worker/permit icons (M12.1) are
 * every one optional per zone: a zone with no gas sensor, no
 * currently-assigned workers, or no active permit simply omits that
 * icon rather than rendering a fabricated zero.
 */
export function PlantMap({
  zones,
  onZoneClick,
  showLegend = false,
  selectedZoneId = null,
}: {
  zones: PlantMapZone[];
  onZoneClick?: (zoneId: string) => void;
  showLegend?: boolean;
  /** Item 2 (Digital Twin polish) - when set, the whole map smoothly
   * zooms/pans toward that zone's already-known layout position (the
   * same fixed `ZONE_LAYOUT` table every zone already renders from -
   * no new coordinate is invented). `null`/omitted keeps the resting,
   * whole-plant view. */
  selectedZoneId?: string | null;
}) {
  const [hoveredZoneId, setHoveredZoneId] = useState<string | null>(null);
  const hovered = zones.find((z) => z.zoneId === hoveredZoneId);

  const selectedIndex = zones.findIndex((zone) => zone.zoneId === selectedZoneId);
  const selectedLayout =
    selectedIndex >= 0 ? layoutFor(zones[selectedIndex].name, selectedIndex) : null;
  const cameraTransform = selectedLayout
    ? (() => {
        const focusX = selectedLayout.x + selectedLayout.width / 2;
        const focusY = selectedLayout.y + selectedLayout.height / 2;
        const scale = 1.5;
        const translateX = 400 - focusX * scale;
        const translateY = 200 - focusY * scale;
        return `translate(${translateX}, ${translateY}) scale(${scale})`;
      })()
    : "translate(0, 0) scale(1)";

  return (
    <div className="plant-map-wrapper">
      <svg className="plant-map" viewBox="0 0 800 400" role="img" aria-label="Plant map">
        <defs>
          {zones
            .filter((zone) => zone.gasRisk !== undefined && zone.gasRisk > 0)
            .map((zone) => (
              <radialGradient key={zone.zoneId} id={`gas-heat-${zone.zoneId}`}>
                <stop offset="0%" stopColor="#ffb703" stopOpacity={0.85} />
                <stop offset="100%" stopColor="#ffb703" stopOpacity={0} />
              </radialGradient>
            ))}
        </defs>

        <g className="plant-zones-camera" transform={cameraTransform}>
        {zones.map((zone, index) => {
          const layout = layoutFor(zone.name, index);
          const cx = layout.x + layout.width / 2;
          const cy = layout.y + layout.height + 18;
          const centerX = layout.x + layout.width / 2;
          const centerY = layout.y + layout.height / 2;
          const heatRadius = Math.max(layout.width, layout.height) * 0.9;

          return (
            <g
              key={zone.zoneId}
              className={`plant-zone${zone.zoneId === selectedZoneId ? " plant-zone-selected" : ""}`}
              tabIndex={0}
              role="button"
              aria-label={`${zone.name}: ${zone.tier}, score ${zone.compoundRiskScore.toFixed(1)}`}
              onMouseEnter={() => setHoveredZoneId(zone.zoneId)}
              onMouseLeave={() => setHoveredZoneId((current) => (current === zone.zoneId ? null : current))}
              onFocus={() => setHoveredZoneId(zone.zoneId)}
              onBlur={() => setHoveredZoneId((current) => (current === zone.zoneId ? null : current))}
              onClick={() => onZoneClick?.(zone.zoneId)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  onZoneClick?.(zone.zoneId);
                }
              }}
            >
              <title>
                {zone.name}: {zone.tier} ({zone.compoundRiskScore.toFixed(1)})
              </title>

              {zone.gasRisk !== undefined && zone.gasRisk > 0 && (
                <ellipse
                  className="plant-zone-heat plant-zone-heat-drift"
                  cx={centerX}
                  cy={centerY}
                  rx={heatRadius}
                  ry={heatRadius * 0.7}
                  fill={`url(#gas-heat-${zone.zoneId})`}
                  opacity={Math.min(1, zone.gasRisk / 100)}
                />
              )}

              <ZoneShapeSvg layout={layout} tier={zone.tier} />

              {zone.tier === "critical" && (
                <rect
                  className="plant-zone-critical-pulse"
                  x={layout.x - 4}
                  y={layout.y - 4}
                  width={layout.width + 8}
                  height={layout.height + 8}
                  rx={8}
                  fill="none"
                />
              )}

              {zone.workerCount !== undefined && zone.workerCount > 0 && (
                <WorkerIcon x={layout.x + 14} y={layout.y - 6} count={zone.workerCount} />
              )}
              {(zone.activePermitTypes ?? []).map((permitType, permitIndex) => (
                <PermitIcon
                  key={`${permitType}-${permitIndex}`}
                  x={layout.x + layout.width - 14 - permitIndex * 18}
                  y={layout.y - 6}
                  permitType={permitType}
                />
              ))}
              {zone.equipmentRisk !== undefined && (
                <EquipmentIcon x={layout.x + layout.width - 14} y={layout.y + layout.height + 6} risk={zone.equipmentRisk} />
              )}
              {zone.gasType !== undefined && zone.gasRisk !== undefined && (
                <SensorIcon x={layout.x + 14} y={layout.y + layout.height + 6} gasType={zone.gasType} risk={zone.gasRisk} />
              )}

              <text x={cx} y={cy} textAnchor="middle" className="plant-zone-label">
                {zone.name}
              </text>
              <text x={cx} y={cy + 16} textAnchor="middle" className="plant-zone-tier">
                {zone.tier}
              </text>
            </g>
          );
        })}
        </g>
      </svg>

      <div className="plant-hover-panel" aria-live="polite">
        {hovered ? (
          <>
            <strong>{hovered.name}</strong>
            <span className={`tier-badge tier-${hovered.tier}`}>{hovered.tier}</span>
            <span>Score: {hovered.compoundRiskScore.toFixed(1)}</span>
            <span>Confidence: {(hovered.confidence * 100).toFixed(0)}%</span>
            <span>{formatTimestamp(hovered.timestamp)}</span>
            {hovered.workerCount !== undefined && <span>Workers: {hovered.workerCount}</span>}
            {(hovered.activePermitTypes ?? []).map((permitType, index) => (
              <span key={`${permitType}-${index}`}>Active permit: {formatPermitType(permitType)}</span>
            ))}
            {hovered.gasType !== undefined && hovered.gasRisk !== undefined && (
              <span>
                {hovered.gasType} sensor risk: {hovered.gasRisk.toFixed(0)}
              </span>
            )}
          </>
        ) : (
          <span className="plant-hover-panel-hint">Hover or focus a zone for details &middot; click to open it</span>
        )}
      </div>

      {showLegend && <PlantMapLegend />}
    </div>
  );
}
