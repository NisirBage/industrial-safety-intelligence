# Digital Twin

The flagship "this is the plant" screen: an interactive SVG site plan
showing zones, workers, equipment, gas sensors, permits, and a risk
heatmap, all colored by the same compound risk every other page
already computes. Built for the first two minutes of a demo - a judge
should be able to look at this one screen and immediately understand
what the platform watches.

## Frozen engine compliance

**Zero changes to any file under `src/domain/`.** Zero new backend
endpoints. Every value on this screen - tier, compound score,
confidence, worker counts, sensor metadata, equipment status, permit
status - was already exposed by an existing endpoint from an earlier
milestone: `GET /risk/current`, `GET /replay`, `GET /zones`,
`GET /workers`, `GET /zones/{id}/sensors`, `GET /zones/{id}/equipment`,
`GET /permits`. Confirmed via `git status --short -- src/domain/`
before, during, and after this milestone.

## Architecture

`PlantMap.tsx` (built M11.1, extended M12.1 and now M16) is the site
plan itself - purely presentational, never fetches or computes
anything. `DigitalTwinPage.tsx` is the new standalone destination
(`/digital-twin`) that feeds it real data and adds a drill-down.

```
GET /risk/current  ─┐
GET /replay        ─┼─▶ DigitalTwinPage ─▶ PlantMap (zones, heatmap, icons)
GET /workers        │         │
GET /zones/*/sensors│         └─▶ ZoneInspectorDrawer (on zone click)
GET /zones/*/equipment
GET /permits
```

**Dual-mode, the same pattern `TimeMachinePage` established**: when a
Time Machine replay is active (`ReplayContext.target !== null`) the
twin renders that replay's current cursor - so scrubbing, playing, or
jumping the Time Machine updates the Digital Twin too, with zero
duplicated replay logic, since both pages read the one shared
`ReplayContext` built in the Time Machine milestone. When no replay is
active it shows live `/risk/current` data, polled the same way
Overview does. A banner makes the mode explicit rather than letting a
replay tick masquerade as "now".

## What's new this milestone

- **Permit-type-specific icons** (`lib/permitIcons.ts::permitTypeGlyph`)
  - a flame for Hot Work, a hatch for Confined Space, a lightning-slash
  for Isolation, a broken pipe for Line Break, a plain clipboard for
  anything else - replacing the old single boolean `hasActivePermit`
  with `PlantMapZone.activePermitTypes: string[]`, so a zone with two
  different active permits shows two distinct glyphs, not one generic
  mark. `lib/permitIcons.ts::activePermitTypesForZone` is the one
  shared derivation every caller (Overview, Time Machine, Scenario
  Replay, Digital Twin) now uses instead of four separate ad hoc
  filters.
- **A distinct gas-sensor glyph** (`SensorIcon`) - separate from the
  ambient heat-wash overlay, since "a sensor monitors this zone" and
  "the Gas Risk agent's score is currently elevated" are two different
  facts that deserve two different marks. Colored by the same
  tier-threshold bands `EquipmentIcon` already used.
- **A subtle gas-drift animation** on the heat ellipse
  (`plant-zone-heat-drift`, `@keyframes gas-drift`) - a slow scale
  pulse, no position jitter, fully covered by the
  `prefers-reduced-motion` exception list.
- **`PlantMapLegend`** - opt-in via `showLegend` (default `false`, so
  existing embeddings on Overview/Time Machine are unchanged); the
  Digital Twin page turns it on.
- **`ZoneInspectorDrawer`** - the click-through detail panel: the
  zone's real sensors (gas type, alarm threshold, last calibration),
  workers currently assigned (`GET /workers` filtered by
  `current_zone_id`), equipment (type, isolation status, maintenance/
  LOTO flags), and every permit ever issued in the zone (not just
  active ones), plus quick links to Zone Detail and Time Machine.

## Known limitations

- **No raw ppm sensor-reading history is exposed by any read
  endpoint** - the platform only persists the derived
  `RiskAssessment.justification.agent_contributions.gas_risk.risk`
  (0-100), not the underlying `sensor_readings` row's raw value, via
  a queryable API. The sensor glyph therefore shows the Gas Risk
  agent's own already-computed score next to the sensor's static
  `alarm_threshold`, exactly like every other page on this platform -
  never a fabricated ppm number.
- The site-plan layout (`ZONE_LAYOUT` in `PlantMap.tsx`) is a fixed
  table of five named zones, unchanged since M11.1 - a zone whose name
  isn't in that table falls back to a generic grid position rather
  than a custom-drawn shape.
- The Digital Twin's replay mode reads the same `ReplayContext` the
  Time Machine populates; it does not itself let a user pick a
  scenario - a user must start a replay from the Time Machine (or the
  Scenario Library) first, then the Digital Twin will show it. This is
  consistent with `docs/architecture/time_machine.md`'s "one shared
  replay cursor" design, not a gap specific to this milestone.
