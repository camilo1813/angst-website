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
const ATTEN = {
  lifeByMachine: 0.25,
  lifeByEnvironment: 0.3,
  machineByLife: 0.25,
  machineByEnvironment: 0.3,
  environmentByLife: 0.28,
  environmentByMachine: 0.3,
  gridByLife: 0.2,
  gridByMachine: 0.2,
  gridByEnvironment: 0.55,
};

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
    life: lerp(1, ATTEN.lifeByMachine, machine) * lerp(1, ATTEN.lifeByEnvironment, environment),
    machine: lerp(1, ATTEN.machineByLife, life) * lerp(1, ATTEN.machineByEnvironment, environment),
    environment: lerp(1, ATTEN.environmentByLife, life) * lerp(1, ATTEN.environmentByMachine, machine),
    grid:
      lerp(1, ATTEN.gridByLife, life) *
      lerp(1, ATTEN.gridByMachine, machine) *
      lerp(1, ATTEN.gridByEnvironment, environment),
  };
}

/** Applies this frame's category weights on top of E02's frozen final scene. Camera, signal, field connections, and central bridge stay exactly at their approved final values throughout. */
export function buildExperience03Scene(baseScene: SceneValues, progress: number): SceneValues {
  const weights = computeCategoryWeights(progress);

  return {
    ...baseScene,
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
