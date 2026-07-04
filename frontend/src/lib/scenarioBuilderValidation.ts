import type { PermitEventDraft, ScenarioDefinitionDraft, SensorEventDraft } from "../api/types";

/**
 * Independent client-side mirror of the same checks the backend's
 * frozen `validate_structure()` (src/domain/simulation/scenario.py)
 * and this milestone's own `validate_builder_scenario`
 * (src/services/scenario_builder.py) perform - kept as its own copy
 * the same way `lib/tier.ts`'s TIER_ORDER already is, so the UI can
 * report every problem at once instead of one round trip per fix.
 * `POST /scenario-builder/validate` remains the authoritative gate
 * before execution; this exists purely for instant feedback.
 */

const CURVE_REQUIRED_PARAMS: Record<string, string[]> = {
  linear_ramp: ["start_value", "slope"],
  exponential_rise: ["start_value", "rate"],
  step: ["baseline", "step_value", "step_time"],
};

/** Mirrors src/domain/simulation/curves.py's three pure curve
 * functions exactly - same formulas, reimplemented for instant
 * client-side feedback (the backend's own generate_sensor_readings
 * remains the authoritative computation at /validate and /execute). */
function evaluateCurve(curve: string, t: number, params: Record<string, number>): number {
  switch (curve) {
    case "linear_ramp":
      return params.start_value + params.slope * t;
    case "exponential_rise":
      return params.start_value * Math.exp(params.rate * t);
    case "step":
      return t >= params.step_time ? params.step_value : params.baseline;
    default:
      return NaN;
  }
}

export interface ScenarioValidationContext {
  knownZoneIds: Set<string>;
  knownWorkerIds: Set<string>;
  unassignedWorkerIds: Set<string>;
  /** zone_id -> gas types that zone actually has a sensor for. */
  zoneGasTypes: Map<string, Set<string>>;
}

function validateSensorEvent(
  event: SensorEventDraft,
  ctx: ScenarioValidationContext,
  errors: string[],
): void {
  if (event.sim_time < 0) {
    errors.push(`event "${event.name}": sim_time must be >= 0`);
  }
  if (event.duration_minutes <= 0) {
    errors.push(`event "${event.name}": duration_minutes must be > 0`);
  }
  if (event.sample_interval_minutes <= 0) {
    errors.push(`event "${event.name}": sample_interval_minutes must be > 0`);
  }

  const requiredParams = CURVE_REQUIRED_PARAMS[event.curve];
  if (!requiredParams) {
    errors.push(
      `event "${event.name}": unknown curve type "${event.curve}" ` +
        `(known: ${Object.keys(CURVE_REQUIRED_PARAMS).sort().join(", ")})`,
    );
  } else {
    const missing = requiredParams.filter((p) => !(p in event.params));
    if (missing.length > 0) {
      errors.push(`event "${event.name}": curve "${event.curve}" missing params ${missing.join(", ")}`);
    } else if (event.duration_minutes > 0 && event.sample_interval_minutes > 0) {
      const steps = Math.floor(event.duration_minutes / event.sample_interval_minutes);
      for (let i = 0; i <= steps; i += 1) {
        const value = evaluateCurve(event.curve, i * event.sample_interval_minutes, event.params);
        if (value < 0) {
          errors.push(
            `event "${event.name}": produces a negative concentration (${value.toFixed(3)}) ` +
              `at t=${i * event.sample_interval_minutes}`,
          );
          break;
        }
      }
    }
  }

  if (!ctx.knownZoneIds.has(event.zone_id)) {
    errors.push(`event "${event.name}": unknown zone "${event.zone_id}"`);
  } else if (!ctx.zoneGasTypes.get(event.zone_id)?.has(event.gas_type)) {
    errors.push(
      `event "${event.name}": no sensor for zone="${event.zone_id}" gas_type="${event.gas_type}"`,
    );
  }
}

function validatePermitEvent(
  event: PermitEventDraft,
  ctx: ScenarioValidationContext,
  errors: string[],
): void {
  if (event.sim_time < 0) {
    errors.push(`event "${event.name}": sim_time must be >= 0`);
  }
  if (event.duration_minutes <= 0) {
    errors.push(`event "${event.name}": duration_minutes must be > 0`);
  }

  if (!ctx.knownZoneIds.has(event.zone_id)) {
    errors.push(`event "${event.name}": unknown zone "${event.zone_id}"`);
  }

  if (!ctx.knownWorkerIds.has(event.authorizing_officer_id)) {
    errors.push(`event "${event.name}": unknown authorizing officer "${event.authorizing_officer_id}"`);
  } else if (ctx.unassignedWorkerIds.has(event.authorizing_officer_id)) {
    errors.push(
      `event "${event.name}": authorizing officer "${event.authorizing_officer_id}" ` +
        `is not currently assigned to any zone`,
    );
  }
}

/** Every validation error for a draft scenario, aggregated (not
 * raised-on-first) so the builder can show every problem at once. */
export function validateScenarioDraft(
  draft: ScenarioDefinitionDraft,
  ctx: ScenarioValidationContext,
): string[] {
  const errors: string[] = [];

  const seenNames = new Set<string>();
  for (const name of [
    ...draft.sensor_events.map((e) => e.name),
    ...draft.permit_events.map((e) => e.name),
  ]) {
    if (seenNames.has(name)) {
      errors.push(`duplicate event name: "${name}"`);
    }
    seenNames.add(name);
  }

  for (const event of draft.sensor_events) {
    validateSensorEvent(event, ctx, errors);
  }
  for (const event of draft.permit_events) {
    validatePermitEvent(event, ctx, errors);
  }

  return errors;
}
