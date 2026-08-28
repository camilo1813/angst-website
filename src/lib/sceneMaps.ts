// Pure, deterministic derivations from Experience 02's single progress
// value (0 → 1). Nothing here holds state — scrolling backward must
// reproduce the exact same output, which is what makes the experience
// reversible and QA screenshots deterministic.

import { lerp, mapRange } from './scrollProgress';

export interface SceneValues {
  signalBoost: number;
  measurementOpacity: number;
  gridOpacity: number;
  secondaryTraceOpacity: number;
  depthPointsOpacity: number;
  lifeVisibility: number;
  machineVisibility: number;
  machineAxisOpacity: number;
  environmentVisibility: number;
  fieldConnectionOpacity: number;
  centralBridgeOpacity: number;
  settleAmbient: number;
  cameraPosition: [number, number, number];
  cameraLookAt: [number, number, number];
  heroEyebrowOpacity: number;
  heroLifeOpacity: number;
  heroMachinesOpacity: number;
  heroEnvironmentsOpacity: number;
  heroConclusionOpacity: number;
  /** 0 = Life cluster sits in its pre-handoff (typography-avoiding) spot; 1 = final position. Desktop only. */
  lifeHandoffT: number;
  /** 1 = full protection (hero copy shielded from spatial noise), 0 = fully absent. Desktop only. */
  copyProtectionStrength: number;
}

export interface CameraProfile {
  start: [number, number, number];
  end: [number, number, number];
  lookAtStart: [number, number, number];
  lookAtEnd: [number, number, number];
  fov: number;
}

// Desktop: wide 16:9-ish frustum comfortably frames the whole field from
// a slight elevation. Mobile's narrow portrait aspect would leave most of
// that same framing outside the horizontal frustum, so mobile gets its
// own closer, more frontal, wider-FOV profile centered on the same
// Life/Machine cluster — "the physical world should occupy most of the
// viewport" by the end, per spec.
const DESKTOP_PROFILE: CameraProfile = {
  start: [0, 4.8, 11],
  end: [0.4, 4.3, 9.2],
  lookAtStart: [0, 0.7, 0],
  lookAtEnd: [0.2, 0.55, 0],
  fov: 34,
};

const MOBILE_PROFILE: CameraProfile = {
  start: [0.6, 4.4, 8],
  end: [1.2, 2.6, 5.2],
  lookAtStart: [0.4, 0.8, 2.5],
  lookAtEnd: [1.2, 1.1, 4],
  fov: 48,
};

export function getCameraProfile(isMobile: boolean): CameraProfile {
  return isMobile ? MOBILE_PROFILE : DESKTOP_PROFILE;
}

/**
 * Overall strength (0→1) of the desktop hero-copy protection field —
 * a temporary shield between the canvas and the hero-echo typography
 * so spatial noise (points, traces) can't visually interfere with the
 * fading copy during the STATE 6 handoff. Piecewise per spec:
 * strong through 0.45, moderate through 0.65, rapidly weakening
 * through 0.78, gone by 0.82.
 */
export function copyProtectionStrength(progress: number): number {
  if (progress <= 0.45) return 1;
  if (progress <= 0.65) return lerp(1, 0.55, (progress - 0.45) / 0.2);
  if (progress <= 0.78) return lerp(0.55, 0.04, (progress - 0.65) / 0.13);
  if (progress < 0.82) return lerp(0.04, 0, (progress - 0.78) / 0.04);
  return 0;
}

/**
 * Mobile-only (<=640px) hero-echo fade envelope. Shared by all five hero
 * lines (eyebrow, Life, Machines, Environments, conclusion) so none can
 * outlive the others — the desktop per-line stagger left the echo legible
 * well past P72 on narrow viewports. Piecewise per the approved P50→P72
 * targets; 0 from P72 onward.
 */
export function mobileHeroEchoOpacity(progress: number): number {
  if (progress <= 0.5) return 1;
  if (progress <= 0.58) return lerp(1, 0.9, (progress - 0.5) / 0.08);
  if (progress <= 0.63) return lerp(0.9, 0.625, (progress - 0.58) / 0.05);
  if (progress <= 0.67) return lerp(0.625, 0.275, (progress - 0.63) / 0.04);
  if (progress <= 0.7) return lerp(0.275, 0.075, (progress - 0.67) / 0.03);
  if (progress <= 0.72) return lerp(0.075, 0, (progress - 0.7) / 0.02);
  return 0;
}

export function computeSceneValues(progress: number, isMobile = false): SceneValues {
  const { start, end, lookAtStart, lookAtEnd } = getCameraProfile(isMobile);
  const cameraPosition: [number, number, number] = [
    lerp(start[0], end[0], progress),
    lerp(start[1], end[1], progress),
    lerp(start[2], end[2], progress),
  ];
  const cameraLookAt: [number, number, number] = [
    lerp(lookAtStart[0], lookAtEnd[0], progress),
    lerp(lookAtStart[1], lookAtEnd[1], progress),
    lerp(lookAtStart[2], lookAtEnd[2], progress),
  ];

  return {
    // STATE 1 — signal awakens, 0.00–0.12, deliberately small delta only.
    signalBoost: mapRange(progress, 0, 0.12, 0, 1),

    // STATE 2 — first measurement fragments, 0.12–0.28, kept extremely faint.
    measurementOpacity: mapRange(progress, 0.12, 0.28, 0, 0.13),

    // STATE 3 — horizon traces form, 0.24–0.42, restrained graphite fragments.
    gridOpacity: mapRange(progress, 0.24, 0.42, 0, 0.13),

    // Additional fragmented traces, 0.35–0.55 — gives P30→P50 visible
    // progression beyond the primary grid/measurement reveal.
    secondaryTraceOpacity: mapRange(progress, 0.35, 0.55, 0, 0.12),

    // STATE 4 — depth point cloud, 0.32–0.54 (starts a touch earlier so
    // P50 reads as materially deeper than P30).
    depthPointsOpacity: mapRange(progress, 0.32, 0.54, 0, 1),

    // STATE 5 — three latent regions, staggered within ~0.45–0.66 per the
    // "P45–65 = world develops" choreography target.
    lifeVisibility: mapRange(progress, 0.45, 0.6, 0, 1),
    machineVisibility: mapRange(progress, 0.48, 0.63, 0, 1),
    // Early partial machine geometry (axis + cross-members only) fades in
    // well before the full envelope — visible partial structure by P50.
    machineAxisOpacity: mapRange(progress, 0.3, 0.48, 0, 0.55),
    environmentVisibility: mapRange(progress, 0.51, 0.66, 0, 1),

    // STATE 7 — one coherent field, 0.78–0.92, restrained connective traces.
    fieldConnectionOpacity: mapRange(progress, 0.78, 0.92, 0, 0.22),
    // A sparse central point cluster bridging Life and Machine so P100
    // reads as one shared field rather than two islands.
    centralBridgeOpacity: mapRange(progress, 0.72, 0.92, 0, 1),

    // STATE 8 — settle: ambient motion amplitude fades toward stillness.
    settleAmbient: 1 - mapRange(progress, 0.92, 1.0, 0, 0.95),

    cameraPosition,
    cameraLookAt,

    // STATE 6 — language gives way to space, overlapping fades. Mobile
    // uses a single faster-collapsing envelope (see mobileHeroEchoOpacity)
    // so the echo is fully gone by ~P72 instead of lingering past P86.
    heroEyebrowOpacity: isMobile
      ? mobileHeroEchoOpacity(progress)
      : 1 - mapRange(progress, 0.55, 0.68, 0, 1),
    heroLifeOpacity: isMobile
      ? mobileHeroEchoOpacity(progress)
      : 1 - mapRange(progress, 0.6, 0.76, 0, 1),
    heroMachinesOpacity: isMobile
      ? mobileHeroEchoOpacity(progress)
      : 1 - mapRange(progress, 0.63, 0.79, 0, 1),
    heroEnvironmentsOpacity: isMobile
      ? mobileHeroEchoOpacity(progress)
      : 1 - mapRange(progress, 0.66, 0.82, 0, 1),
    heroConclusionOpacity: isMobile
      ? mobileHeroEchoOpacity(progress)
      : 1 - mapRange(progress, 0.7, 0.86, 0, 1),

    // Desktop-only: Life stays out of the headline's screen region until
    // the hero has dropped below ~50% strength, then migrates left into
    // the space the typography just vacated (P66→P80).
    lifeHandoffT: mapRange(progress, 0.66, 0.8, 0, 1),

    copyProtectionStrength: copyProtectionStrength(progress),
  };
}
