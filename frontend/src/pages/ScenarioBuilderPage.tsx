import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

import type { PermitEventDraft, ScenarioDefinitionDraft, SensorEventDraft } from "../api/types";
import { TierBadge } from "../components/common/TierBadge";
import { TimelineEditor, type TimelineEvent } from "../components/scenarioBuilder/TimelineEditor";
import {
  useAllZoneSensors,
  useBuilderOptions,
  useExecuteScenario,
  useValidateScenario,
  useWorkers,
  useZoneEquipment,
} from "../hooks/useScenarioBuilder";
import { useZones } from "../hooks/useZones";
import { zoneLabel } from "../lib/format";
import { formatPermitType } from "../lib/permitIcons";
import { buildExpectedSequence, summarizeScenario } from "../lib/scenarioBuilderPreview";
import {
  validateScenarioDraft,
  type ScenarioValidationContext,
} from "../lib/scenarioBuilderValidation";

/** Friendlier labels for curve params than the raw Python identifier -
 * matches the product requirement's "Baseline / Leak rate / Severity"
 * vocabulary onto the frozen curve registry's real param names
 * (src/domain/simulation/curves.py), never inventing a new field. */
const PARAM_LABELS: Record<string, string> = {
  start_value: "Baseline",
  slope: "Leak rate (linear)",
  rate: "Leak rate (exponential)",
  baseline: "Baseline",
  step_value: "Severity (spike value)",
  step_time: "Time of spike (minutes into event)",
};

interface DraftSensorEvent extends SensorEventDraft {
  id: string;
}
interface DraftPermitEvent extends PermitEventDraft {
  id: string;
}

function newId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Item 1 (Scenario Builder) - compose a scenario through forms and a
 * draggable timeline instead of hand-editing YAML. Every entity here
 * is picked FROM already-existing, pre-seeded plant data (zones,
 * sensors, workers) - nothing is invented (see the approved scope
 * decision: extending the frozen Scenario schema to author new
 * zones/workers/equipment inline would need an ADR). Equipment is a
 * read-only browser: the frozen Scenario schema has no equipment-event
 * concept at all. Validation runs client-side instantly
 * (lib/scenarioBuilderValidation.ts) and again, authoritatively, via
 * POST /scenario-builder/validate before Execute is enabled.
 */
export function ScenarioBuilderPage() {
  const { data: zones } = useZones();
  const { data: workers } = useWorkers();
  const { data: options } = useBuilderOptions();

  const zoneIds = useMemo(() => (zones ?? []).map((z) => z.zone_id), [zones]);
  const zoneSensorQueries = useAllZoneSensors(zoneIds);

  const [title, setTitle] = useState("My Scenario");
  const [description, setDescription] = useState("");
  const [seed, setSeed] = useState(1);
  const [startTime, setStartTime] = useState("2026-08-01T09:00");

  const [sensorEvents, setSensorEvents] = useState<DraftSensorEvent[]>([]);
  const [permitEvents, setPermitEvents] = useState<DraftPermitEvent[]>([]);

  const [equipmentZoneId, setEquipmentZoneId] = useState("");
  const { data: equipment } = useZoneEquipment(equipmentZoneId || undefined);

  const validateMutation = useValidateScenario();
  const executeMutation = useExecuteScenario();

  const zoneGasTypes = useMemo(() => {
    const map = new Map<string, Set<string>>();
    zoneIds.forEach((zoneId, index) => {
      const sensors = zoneSensorQueries[index]?.data ?? [];
      map.set(zoneId, new Set(sensors.map((s) => s.gas_type)));
    });
    return map;
  }, [zoneIds, zoneSensorQueries]);

  const draft: ScenarioDefinitionDraft = useMemo(
    () => ({
      title,
      description,
      seed,
      start_time: new Date(startTime).toISOString(),
      sensor_events: sensorEvents.map(({ id: _id, ...rest }) => rest),
      permit_events: permitEvents.map(({ id: _id, ...rest }) => rest),
    }),
    [title, description, seed, startTime, sensorEvents, permitEvents],
  );

  const validationContext: ScenarioValidationContext = useMemo(
    () => ({
      knownZoneIds: new Set(zoneIds),
      knownWorkerIds: new Set((workers ?? []).map((w) => w.worker_id)),
      unassignedWorkerIds: new Set(
        (workers ?? []).filter((w) => w.current_zone_id === null).map((w) => w.worker_id),
      ),
      zoneGasTypes,
    }),
    [zoneIds, workers, zoneGasTypes],
  );

  const clientErrors = useMemo(
    () => validateScenarioDraft(draft, validationContext),
    [draft, validationContext],
  );

  const summary = useMemo(() => summarizeScenario(draft), [draft]);
  const sequence = useMemo(() => buildExpectedSequence(draft), [draft]);

  const timelineEvents: TimelineEvent[] = [
    ...sensorEvents.map((e) => ({ id: e.id, kind: "sensor" as const, name: e.name, simTime: e.sim_time, durationMinutes: e.duration_minutes })),
    ...permitEvents.map((e) => ({ id: e.id, kind: "permit" as const, name: e.name, simTime: e.sim_time, durationMinutes: e.duration_minutes })),
  ];

  function moveEvent(id: string, simTime: number) {
    setSensorEvents((events) => events.map((e) => (e.id === id ? { ...e, sim_time: simTime } : e)));
    setPermitEvents((events) => events.map((e) => (e.id === id ? { ...e, sim_time: simTime } : e)));
  }
  function resizeEvent(id: string, durationMinutes: number) {
    setSensorEvents((events) =>
      events.map((e) => (e.id === id ? { ...e, duration_minutes: durationMinutes } : e)),
    );
    setPermitEvents((events) =>
      events.map((e) => (e.id === id ? { ...e, duration_minutes: durationMinutes } : e)),
    );
  }
  function deleteEvent(id: string) {
    setSensorEvents((events) => events.filter((e) => e.id !== id));
    setPermitEvents((events) => events.filter((e) => e.id !== id));
  }

  function exportDraft() {
    const blob = new Blob([JSON.stringify(draft, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title.replace(/\s+/g, "_") || "scenario"}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function importDraft(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result)) as ScenarioDefinitionDraft;
        setTitle(parsed.title ?? "Imported Scenario");
        setDescription(parsed.description ?? "");
        setSeed(parsed.seed ?? 1);
        setStartTime(parsed.start_time ? parsed.start_time.slice(0, 16) : startTime);
        setSensorEvents((parsed.sensor_events ?? []).map((e) => ({ ...e, id: newId("sensor") })));
        setPermitEvents((parsed.permit_events ?? []).map((e) => ({ ...e, id: newId("permit") })));
      } catch {
        window.alert("That file isn't a valid scenario definition.");
      }
    };
    reader.readAsText(file);
  }

  return (
    <section>
      <h1>Scenario Builder</h1>
      <p className="page-intro">
        Compose a deterministic incident from already-existing plant data - zones, sensors, and
        workers - then execute it through the same unmodified pipeline every pre-authored scenario
        already runs through. Nothing here changes how risk is computed.
      </p>

      <div className="card scenario-builder-metadata">
        <h2>Scenario Details</h2>
        <label>
          Title:{" "}
          <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label>
          Description:{" "}
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} />
        </label>
        <label>
          Seed: <input type="number" value={seed} onChange={(e) => setSeed(Number(e.target.value))} />
        </label>
        <label>
          Start time:{" "}
          <input
            type="datetime-local"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
          />
        </label>
      </div>

      <SensorEventForm
        zones={zones ?? []}
        zoneSensors={zoneGasTypes}
        curves={options?.curves ?? []}
        onAdd={(event) => setSensorEvents((events) => [...events, { ...event, id: newId("sensor") }])}
      />

      <PermitEventForm
        zones={zones ?? []}
        workers={workers ?? []}
        permitTypes={options?.permit_types ?? []}
        onAdd={(event) => setPermitEvents((events) => [...events, { ...event, id: newId("permit") }])}
      />

      <div className="card">
        <h2>Equipment (read-only)</h2>
        <p>
          Equipment has no scenario-event concept - this browses its already-existing state so you
          know what will influence the Equipment Status agent.
        </p>
        <label>
          Zone:{" "}
          <select value={equipmentZoneId} onChange={(e) => setEquipmentZoneId(e.target.value)}>
            <option value="">Select a zone&hellip;</option>
            {(zones ?? []).map((zone) => (
              <option key={zone.zone_id} value={zone.zone_id}>
                {zone.name}
              </option>
            ))}
          </select>
        </label>
        {equipmentZoneId && (
          <ul>
            {(equipment ?? []).map((eq) => (
              <li key={eq.equipment_id}>
                <strong>{eq.equipment_type}</strong> &mdash; Health:{" "}
                {eq.isolation_status === "active" ? "Healthy" : eq.isolation_status} &middot;
                Inspection overdue: {eq.maintenance_flag ? "Yes" : "No"} &middot; LOTO confirmed:{" "}
                {eq.loto_confirmed ? "Yes" : "No"}
              </li>
            ))}
            {(equipment ?? []).length === 0 && <li>No equipment recorded for this zone.</li>}
          </ul>
        )}
      </div>

      <div className="card">
        <h2>Timeline</h2>
        <TimelineEditor
          events={timelineEvents}
          onMove={moveEvent}
          onResize={resizeEvent}
          onDelete={deleteEvent}
        />
      </div>

      <div className="card">
        <h2>Preview</h2>
        <div className="card-grid">
          <div className="card">
            <p>Sensor events</p>
            <p style={{ fontSize: "1.5rem" }}>{summary.sensorEventCount}</p>
          </div>
          <div className="card">
            <p>Work authorization events</p>
            <p style={{ fontSize: "1.5rem" }}>{summary.permitEventCount}</p>
          </div>
          <div className="card">
            <p>Total duration</p>
            <p style={{ fontSize: "1.5rem" }}>{summary.totalDurationMinutes} min</p>
          </div>
          <div className="card">
            <p>Affected zones</p>
            <p style={{ fontSize: "1.5rem" }}>{summary.affectedZoneIds.length}</p>
          </div>
        </div>
        <h3>Affected zones</h3>
        <ul>
          {summary.affectedZoneIds.map((zoneId) => (
            <li key={zoneId}>{zoneLabel(zoneId, zones)}</li>
          ))}
        </ul>
        <h3>Expected sequence</h3>
        <ol>
          {sequence.map((step) => (
            <li key={`${step.kind}-${step.name}`}>
              t+{step.simTime}min: {step.kind === "sensor" ? "Sensor event" : "Work Authorization"} &quot;
              {step.name}&quot; in {zoneLabel(step.zoneId, zones)} (
              {step.durationMinutes} min)
            </li>
          ))}
        </ol>
      </div>

      <div className="card">
        <h2>Validation</h2>
        {clientErrors.length === 0 ? (
          <p>No client-side problems found.</p>
        ) : (
          <ul className="alert-list">
            {clientErrors.map((err, index) => (
              <li key={index} className="alert-item alert-critical">
                {err}
              </li>
            ))}
          </ul>
        )}
        <button
          type="button"
          disabled={validateMutation.isPending}
          onClick={() => validateMutation.mutate(draft)}
        >
          {validateMutation.isPending ? "Validating..." : "Validate with backend"}
        </button>
        {validateMutation.data && (
          <div>
            <p>
              Backend says:{" "}
              {validateMutation.data.valid ? "valid" : `invalid (${validateMutation.data.errors.length} error(s))`}
            </p>
            {!validateMutation.data.valid && (
              <ul className="alert-list">
                {validateMutation.data.errors.map((err, index) => (
                  <li key={index} className="alert-item alert-critical">
                    {err}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      <div className="card">
        <h2>Execute</h2>
        <p>
          <button
            type="button"
            disabled={clientErrors.length > 0 || executeMutation.isPending}
            onClick={() => executeMutation.mutate(draft)}
          >
            {executeMutation.isPending ? "Executing..." : "Execute Scenario"}
          </button>{" "}
          <button type="button" onClick={exportDraft}>
            Export
          </button>{" "}
          <label className="scenario-builder-import-label">
            Import
            <input
              type="file"
              accept="application/json"
              style={{ display: "none" }}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  importDraft(file);
                }
                e.target.value = "";
              }}
            />
          </label>
        </p>
        {executeMutation.data && (
          <div>
            {executeMutation.data.valid ? (
              <>
                <p className="execute-success-banner">
                  <span className="execute-success-check" aria-hidden="true">
                    &#10003;
                  </span>
                  Scenario executed - {executeMutation.data.zone_results.length} zone(s) persisted through
                  the unmodified pipeline.
                </p>
                <ul className="card-grid">
                  {executeMutation.data.zone_results.map((result) => (
                    <li key={result.zone_id} className="card">
                      <h3>{zoneLabel(result.zone_id, zones)}</h3>
                      <p>
                        {result.final_score.toFixed(1)} <TierBadge tier={result.final_tier} />
                      </p>
                      <p>{result.tick_count} ticks persisted</p>
                      <p>
                        <Link to={`/zones/${result.zone_id}`}>View zone &rarr;</Link>
                      </p>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <ul className="alert-list">
                {executeMutation.data.errors.map((err, index) => (
                  <li key={index} className="alert-item alert-critical">
                    {err}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function SensorEventForm({
  zones,
  zoneSensors,
  curves,
  onAdd,
}: {
  zones: { zone_id: string; name: string }[];
  zoneSensors: Map<string, Set<string>>;
  curves: { name: string; required_params: string[] }[];
  onAdd: (event: SensorEventDraft) => void;
}) {
  const [name, setName] = useState("");
  const [zoneId, setZoneId] = useState("");
  const [gasType, setGasType] = useState("");
  const [simTime, setSimTime] = useState(0);
  const [duration, setDuration] = useState(30);
  const [interval, setInterval] = useState(5);
  const [curve, setCurve] = useState(curves[0]?.name ?? "linear_ramp");
  const [params, setParams] = useState<Record<string, number>>({});

  const availableGasTypes = zoneId ? [...(zoneSensors.get(zoneId) ?? [])] : [];
  const requiredParams = curves.find((c) => c.name === curve)?.required_params ?? [];

  return (
    <div className="card">
      <h2>Add Sensor Event</h2>
      <label>
        Name: <input type="text" value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <label>
        Zone:{" "}
        <select
          value={zoneId}
          onChange={(e) => {
            setZoneId(e.target.value);
            setGasType("");
          }}
        >
          <option value="">Select a zone&hellip;</option>
          {zones.map((zone) => (
            <option key={zone.zone_id} value={zone.zone_id}>
              {zone.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Gas type:{" "}
        <select value={gasType} onChange={(e) => setGasType(e.target.value)} disabled={!zoneId}>
          <option value="">Select a gas type&hellip;</option>
          {availableGasTypes.map((gt) => (
            <option key={gt} value={gt}>
              {gt}
            </option>
          ))}
        </select>
      </label>
      <label>
        Curve:{" "}
        <select
          value={curve}
          onChange={(e) => {
            setCurve(e.target.value);
            setParams({});
          }}
        >
          {curves.map((c) => (
            <option key={c.name} value={c.name}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      {requiredParams.map((paramName) => (
        <label key={paramName}>
          {PARAM_LABELS[paramName] ?? paramName}:{" "}
          <input
            type="number"
            value={params[paramName] ?? ""}
            onChange={(e) =>
              setParams((p) => ({ ...p, [paramName]: Number(e.target.value) }))
            }
          />
        </label>
      ))}
      <label>
        Start time (min): <input type="number" value={simTime} onChange={(e) => setSimTime(Number(e.target.value))} />
      </label>
      <label>
        Duration (min): <input type="number" value={duration} onChange={(e) => setDuration(Number(e.target.value))} />
      </label>
      <label>
        Sample interval (min):{" "}
        <input type="number" value={interval} onChange={(e) => setInterval(Number(e.target.value))} />
      </label>
      <p>
        <button
          type="button"
          disabled={!name || !zoneId || !gasType}
          onClick={() => {
            onAdd({
              name,
              zone_id: zoneId,
              gas_type: gasType,
              sim_time: simTime,
              duration_minutes: duration,
              sample_interval_minutes: interval,
              curve,
              params,
            });
            setName("");
          }}
        >
          Add Sensor Event
        </button>
      </p>
    </div>
  );
}

function PermitEventForm({
  zones,
  workers,
  permitTypes,
  onAdd,
}: {
  zones: { zone_id: string; name: string }[];
  workers: { worker_id: string; role: string; current_zone_id: string | null }[];
  permitTypes: string[];
  onAdd: (event: PermitEventDraft) => void;
}) {
  const [name, setName] = useState("");
  const [zoneId, setZoneId] = useState("");
  const [permitType, setPermitType] = useState(permitTypes[0] ?? "hot_work");
  const [officerId, setOfficerId] = useState("");
  const [simTime, setSimTime] = useState(0);
  const [duration, setDuration] = useState(120);

  return (
    <div className="card">
      <h2>Add Work Authorization Event</h2>
      <label>
        Name: <input type="text" value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <label>
        Zone:{" "}
        <select value={zoneId} onChange={(e) => setZoneId(e.target.value)}>
          <option value="">Select a zone&hellip;</option>
          {zones.map((zone) => (
            <option key={zone.zone_id} value={zone.zone_id}>
              {zone.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Work authorization type:{" "}
        <select value={permitType} onChange={(e) => setPermitType(e.target.value)}>
          {permitTypes.map((pt) => (
            <option key={pt} value={pt}>
              {formatPermitType(pt)}
            </option>
          ))}
        </select>
      </label>
      <label>
        Authorizing officer:{" "}
        <select value={officerId} onChange={(e) => setOfficerId(e.target.value)}>
          <option value="">Select a worker&hellip;</option>
          {workers.map((worker) => (
            <option key={worker.worker_id} value={worker.worker_id}>
              {worker.role} ({worker.worker_id.slice(0, 8)})
              {worker.current_zone_id === null ? " - unassigned" : ""}
            </option>
          ))}
        </select>
      </label>
      <label>
        Start time (min): <input type="number" value={simTime} onChange={(e) => setSimTime(Number(e.target.value))} />
      </label>
      <label>
        Duration (min): <input type="number" value={duration} onChange={(e) => setDuration(Number(e.target.value))} />
      </label>
      <p>
        <button
          type="button"
          disabled={!name || !zoneId || !officerId}
          onClick={() => {
            onAdd({
              name,
              zone_id: zoneId,
              sim_time: simTime,
              permit_type: permitType,
              authorizing_officer_id: officerId,
              duration_minutes: duration,
            });
            setName("");
          }}
        >
          Add Work Authorization Event
        </button>
      </p>
    </div>
  );
}
