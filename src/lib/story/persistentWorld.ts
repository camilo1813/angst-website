// Persistent physical world — STATE MODEL (P2B, pure functions).
//
// ONE physical world, several semantic states. The persistent world never owns its own maps:
// every value comes from the coordinator (progress, mode, segment) and the APPROVED maps
//   E02 phase: computeSceneValues(p02, isMobile)                         (the world forms)
//   E03 phase: buildExperience03Scene(computeSceneValues(1, isMobile), p03) (the same world, read
//              as Life / Machines / Environments)
// exactly as the legacy E02 / E03 canvases compute them. No new scene states, no E04 semantics.

import { computeSceneValues, getCameraProfile, type SceneValues } from '../sceneMaps';
import { buildExperience03Scene } from '../experience03Maps';
import type { ScrollProgressState } from '../scrollProgress';
import { ambientAmplitude, pointBudgetFor } from '../worldRuntime';
import type { PointBudget } from '../pointBudgets';
import type { Segment } from './geometry';

export type WorldPhase = 'e02' | 'e03';

/**
 * Which semantic phase the one world is in. Everything before E03 (E01 travel, E02, the legacy
 * E02→E03 boundary) is the E02 phase; E03 and beyond is the E03 phase. Across the boundary the
 * world is continuous because E02 p=1 and E03 p=0 are the same scene (see handoffDifferences).
 */
export function worldPhaseFor(segment: Segment): WorldPhase {
  // E04 adds information ABOUT the world, never a new world state: through the E03→E04 handoff and
  // all of E04 the world stays in the E03 phase, whose progress is clamped at 1 (E03's final frame).
  return segment === 'e03' || segment === 'after-e03' || segment === 'e04-handoff' || segment === 'e04' ? 'e03' : 'e02';
}

export interface PersistentWorldInputs {
  segment: Segment;
  isMobile: boolean;
  reducedMotion: boolean;
  /** Progress streams exactly as delivered to the legacy consumers (coordinator.subscribeSection). */
  e02: ScrollProgressState;
  e03: ScrollProgressState;
}

export interface PersistentWorldState {
  phase: WorldPhase;
  /** Section-local progress actually used for the active phase. */
  progress: number;
  scene: SceneValues;
  ambientAmplitude: number;
  isMobile: boolean;
  pointBudget: PointBudget;
  fov: number;
}

/** Scene for a phase/progress pair — the single definition both legacy canvases already follow. */
export function worldScene(phase: WorldPhase, progress: number, isMobile: boolean): SceneValues {
  return phase === 'e02'
    ? computeSceneValues(progress, isMobile)
    : buildExperience03Scene(computeSceneValues(1, isMobile), progress, isMobile);
}

export function computePersistentWorldState(i: PersistentWorldInputs): PersistentWorldState {
  const phase = worldPhaseFor(i.segment);
  // E02 under reduced motion presents the settled world (legacy PhysicalWorldCanvas: progress 1, no scrub).
  // E03 tracks scroll under reduced motion (legacy Experience03Controller).
  const stream = phase === 'e02' ? i.e02 : i.e03;
  const progress = phase === 'e02' && i.reducedMotion ? 1 : stream.progress;
  const isScrolling = phase === 'e02' && i.reducedMotion ? false : stream.isScrolling;
  const scene = worldScene(phase, progress, i.isMobile);
  return {
    phase,
    progress,
    scene,
    ambientAmplitude: ambientAmplitude(scene.settleAmbient, i.reducedMotion, isScrolling),
    isMobile: i.isMobile,
    pointBudget: pointBudgetFor(i.isMobile),
    fov: getCameraProfile(i.isMobile).fov,
  };
}

/** Every SceneValues key whose value differs between E02 p=1 and E03 p=0 (expected: none). */
export function handoffDifferences(isMobile: boolean) {
  const a = worldScene('e02', 1, isMobile) as unknown as Record<string, unknown>;
  const b = worldScene('e03', 0, isMobile) as unknown as Record<string, unknown>;
  return Object.keys(a).filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k])).map((k) => ({ key: k, e02p100: a[k], e03p00: b[k] }));
}
