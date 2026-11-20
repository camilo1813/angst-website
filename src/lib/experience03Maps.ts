// Pure, deterministic derivations from Experience 03's own single progress
// value (0 -> 1), mirroring sceneMaps.ts's contract: nothing here holds
// state, so scrolling backward reproduces the exact same output.
//
// Experience 03 never rebuilds or re-poses the Experience 02 world. It
// takes that world's exact final frame (computeSceneValues(1, isMobile),
// the same frozen state approved as e02-physical-world-approved) and
// applies per-category ATTENUATION on top of it: the category currently
// "in focus" stays at its full approved strength, the other two dim to a
// restrained fraction. Nothing here changes geometry, camera, or counts.

import type { SceneValues } from './sceneMaps';
import { lerp, mapRange } from './scrollProgress';

export interface CategoryWeights {
  life: number;
  machine: number;
  environment: number;
  /** Spatial grid / measurement traces / depth point cloud. */
  grid: number;
}

export interface Experience03Labels {
  orientation: number;
  life: number;
  machines: number;
  environments: number;
  statementPrimary: number;
  statementFinal: number;
  /** Mobile-only (<=640px) localized reading-protection strength behind the final statement. 0 on desktop. */
  mobileStatementShield: number;
}

export interface Experience03State {
  progress: number;
  lifeDominance: number;
  machineDominance: number;
  environmentDominance: number;
  weights: CategoryWeights;
  labels: Experience03Labels;
}

/** 0 before riseStart, ramps to 1 by riseEnd, holds 1 until fallStart, ramps back to 0 by fallEnd. */
function trapezoid(progress: number, riseStart: number, riseEnd: number, fallStart: number, fallEnd: number): number {
  const rising = mapRange(progress, riseStart, riseEnd, 0, 1);
  const falling = mapRange(progress, fallStart, fallEnd, 1, 0);
  return Math.min(rising, falling);
}

// STATE B — LIFE: ~0.12 -> 0.32 (rise 0.12-0.20, hold to 0.28, exit 0.28-0.38 per spec section 10).
const LIFE_WINDOW = [0.12, 0.2, 0.28, 0.38] as const;
// STATE C — MACHINES: ~0.34 -> 0.54 (rise starts a touch early to crossfade with Life's exit).
const MACHINE_WINDOW = [0.3, 0.4, 0.5, 0.6] as const;
// STATE D — ENVIRONMENTS: ~0.56 -> 0.76, return-to-balance completes by 0.84 (spec section 18).
const ENVIRONMENT_WINDOW = [0.56, 0.64, 0.72, 0.84] as const;

// Attenuation targets a non-focused category falls to while another
// category holds full dominance — every value sits inside the spec's
// approved per-state hierarchy ranges (sections 7, 11, 15).
// VISUAL CORRECTION PASS: non-focused categories dim much more strongly (was 0.25–0.3), so focus no
// longer reads as a small opacity difference.
const ATTEN = {
  lifeByMachine: 0.1,
  // Environment is the space AROUND the other two: they stay faintly present inside it.
  lifeByEnvironment: 0.3,
  machineByLife: 0.1,
  machineByEnvironment: 0.3,
  environmentByLife: 0.1,
  environmentByMachine: 0.12,
  gridByLife: 0.1,
  gridByMachine: 0.1,
  gridByEnvironment: 1.0,
};

// …and the focused category becomes more present than its balanced strength (scene opacity factors;
// every resulting material opacity stays ≤ 1).
const FOCUS_BOOST = { life: 1.25, machine: 1.45, environment: 1.95 };

/**
 * Restrained SPATIAL emphasis (visual correction pass): during each focus beat the camera pans a
 * little toward the subject and narrows its field slightly (zoom). Same camera height and depth —
 * no dolly — so nothing in the world crosses the camera plane. Balance (no focus) returns the camera
 * exactly to the approved E02-final pose.
 *   lookAt shift = (target − base lookAt) × LOOK_SHARE × dominance
 *   camera x pan = lookAt x shift × PAN_SHARE
 */
interface FocusMove { target: [number, number, number]; zoom: number }
const DESKTOP_FOCUS: Record<'life' | 'machine' | 'environment', FocusMove> = {
  life: { target: [-2.2, 1.15, 3.2], zoom: 1.22 },
  machine: { target: [1.8, 0.75, 4.4], zoom: 1.22 },
  // Environment: the view opens out (wider field) and lifts slightly over the environmental field, so the
  // whole space around Life and Machine — now faint inside it — becomes the subject.
  environment: { target: [0.9, 1.7, 2.6], zoom: 0.84 },
};
const MOBILE_FOCUS: Record<'life' | 'machine' | 'environment', FocusMove> = {
  life: { target: [1.07, 0.75, 3.6], zoom: 1.12 },
  machine: { target: [1.35, 0.7, 4.0], zoom: 1.12 },
  // Mobile: the portrait frame shows almost none of the wide environment field at balance; the beat
  // opens the view up and back over the field (Life / Machine stay at the bottom of the frame).
  environment: { target: [1.2, 1.6, 0.5], zoom: 0.72 },
};
const LOOK_SHARE = 0.55;
const PAN_SHARE = 0.45;

export function computeDominance(progress: number) {
  return {
    life: trapezoid(progress, ...LIFE_WINDOW),
    machine: trapezoid(progress, ...MACHINE_WINDOW),
    environment: trapezoid(progress, ...ENVIRONMENT_WINDOW),
  };
}

export function computeCategoryWeights(progress: number): CategoryWeights {
  const { life, machine, environment } = computeDominance(progress);

  return {
    life: lerp(1, FOCUS_BOOST.life, life) * lerp(1, ATTEN.lifeByMachine, machine) * lerp(1, ATTEN.lifeByEnvironment, environment),
    machine: lerp(1, FOCUS_BOOST.machine, machine) * lerp(1, ATTEN.machineByLife, life) * lerp(1, ATTEN.machineByEnvironment, environment),
    environment: lerp(1, FOCUS_BOOST.environment, environment) * lerp(1, ATTEN.environmentByLife, life) * lerp(1, ATTEN.environmentByMachine, machine),
    grid:
      lerp(1, ATTEN.gridByLife, life) *
      lerp(1, ATTEN.gridByMachine, machine) *
      lerp(1, ATTEN.gridByEnvironment, environment),
  };
}

/** Applies this frame's category weights and focus reframe on top of E02's final scene. Signal, field connections and central bridge stay at their final values; the camera returns exactly to the E02-final pose whenever no category is in focus. */
export function buildExperience03Scene(baseScene: SceneValues, progress: number, isMobile = false): SceneValues {
  const weights = computeCategoryWeights(progress);
  const dom = computeDominance(progress);
  const focus = isMobile ? MOBILE_FOCUS : DESKTOP_FOCUS;
  const look = [...baseScene.cameraLookAt] as [number, number, number];
  let zoom = 1;
  for (const k of ['life', 'machine', 'environment'] as const) {
    const d = dom[k];
    if (d <= 0) continue;
    for (let i = 0; i < 3; i++) look[i] += (focus[k].target[i] - baseScene.cameraLookAt[i]) * LOOK_SHARE * d;
    zoom *= lerp(1, focus[k].zoom, d);
  }
  const cam: [number, number, number] = [
    baseScene.cameraPosition[0] + (look[0] - baseScene.cameraLookAt[0]) * PAN_SHARE,
    baseScene.cameraPosition[1],
    baseScene.cameraPosition[2],
  ];

  return {
    ...baseScene,
    cameraPosition: cam,
    cameraLookAt: look,
    // The responsive framing stays fitted to the balanced (E02-final) pose.
    framingPosition: baseScene.cameraPosition,
    framingLookAt: baseScene.cameraLookAt,
    zoom,
    lifeVisibility: baseScene.lifeVisibility * weights.life,
    machineVisibility: baseScene.machineVisibility * weights.machine,
    machineAxisOpacity: baseScene.machineAxisOpacity * weights.machine,
    environmentVisibility: baseScene.environmentVisibility * weights.environment,
    gridOpacity: baseScene.gridOpacity * weights.grid,
    measurementOpacity: baseScene.measurementOpacity * weights.grid,
    secondaryTraceOpacity: baseScene.secondaryTraceOpacity * weights.grid,
    depthPointsOpacity: baseScene.depthPointsOpacity * weights.grid,
  };
}

/**
 * Mobile-only (<=640px) localized reading-protection field behind the
 * final relationship statement. Begins only once the statement itself
 * begins (progress 0.82), per the approved p0.82->p1.00 target curve.
 * Never applied on desktop — the caller gates this to isMobile.
 */
function computeMobileStatementShield(progress: number): number {
  if (progress <= 0.82) return 0;
  if (progress <= 0.86) return lerp(0, 0.25, (progress - 0.82) / 0.04);
  if (progress <= 0.9) return lerp(0.25, 0.55, (progress - 0.86) / 0.04);
  if (progress <= 0.95) return lerp(0.55, 0.8, (progress - 0.9) / 0.05);
  if (progress <= 1) return lerp(0.8, 0.9, (progress - 0.95) / 0.05);
  return 0.9;
}

function computeLabelOpacities(
  progress: number,
  dominance: { life: number; machine: number; environment: number },
  isMobile: boolean,
): Experience03Labels {
  const orientation = trapezoid(progress, 0.01, 0.04, 0.08, 0.13);

  // STATE E — statement: primary rises 0.82-0.88, holds, then softens as
  // the final line brightens in (spec sections 19-20).
  const statementRise = mapRange(progress, 0.82, 0.88, 0, 1);
  const statementSoften = mapRange(progress, 0.9, 0.95, 1, 0.7);
  const statementPrimary = Math.min(statementRise, statementSoften);
  const statementFinal = mapRange(progress, 0.9, 0.97, 0, 1);

  return {
    orientation,
    life: dominance.life,
    machines: dominance.machine,
    environments: dominance.environment,
    statementPrimary,
    statementFinal,
    mobileStatementShield: isMobile ? computeMobileStatementShield(progress) : 0,
  };
}

export function computeExperience03State(progress: number, isMobile = false): Experience03State {
  const dominance = computeDominance(progress);
  const weights = computeCategoryWeights(progress);
  const labels = computeLabelOpacities(progress, dominance, isMobile);

  return {
    progress,
    lifeDominance: dominance.life,
    machineDominance: dominance.machine,
    environmentDominance: dominance.environment,
    weights,
    labels,
  };
}

/**
 * Coarse discrete bucket for the no-WebGL SVG fallback, which can only
 * express emphasis through CSS classes rather than continuous opacity.
 */
export function computeFallbackBucket(progress: number): 'whole' | 'life' | 'machines' | 'environments' | 'relationship' {
  const { life, machine, environment } = computeDominance(progress);
  const strongest = Math.max(life, machine, environment);
  if (strongest < 0.35) return progress >= 0.78 ? 'relationship' : 'whole';
  if (life === strongest) return 'life';
  if (machine === strongest) return 'machines';
  return 'environments';
}
