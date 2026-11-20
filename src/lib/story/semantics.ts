// Shared story coordinator — SEMANTICS (pure functions).
//
// Derives semantic descriptors from progress using the PRODUCTION maps themselves
// (sceneMaps / experience03Maps) — never duplicated thresholds — so the labels can
// only ever describe what the approved experiences actually render.

import { computeSceneValues } from '../sceneMaps';
import { computeDominance, computeExperience03State } from '../experience03Maps';
import type { Segment } from './geometry';
import { phaseAt as e04PhaseAt, type E04Phase } from '../experience04Maps';

export type E02Phase = 'forming' | 'formed';
export type E03Phase = 'neutral' | 'life-focus' | 'machine-focus' | 'environment-focus' | 'relationship-statement';

export interface E02Semantics {
  phase: E02Phase;
  /** Mean visibility of Life / Machine / Environment (0 → 1). */
  worldCompleteness: number;
  /** Strongest remaining hero-echo line opacity (language still on screen). */
  languagePresence: number;
}

export interface E03Semantics {
  phase: E03Phase;
  dominance: { life: number; machine: number; environment: number };
  statement: { supporting: number; payoff: number };
}

export interface E04Semantics {
  phase: E04Phase | 'not-started';
}

export interface SemanticDescriptor {
  segment: Segment;
  /** Single human-readable label for the whole page state, e.g. "e02:forming", "e03:life-focus". */
  label: string;
  e02: E02Semantics;
  e03: E03Semantics;
  e04: E04Semantics;
}

export function describeE02(p: number, isMobile: boolean): E02Semantics {
  const s = computeSceneValues(p, isMobile);
  const vis = [s.lifeVisibility, s.machineVisibility, s.environmentVisibility];
  return {
    phase: vis.every((v) => v >= 1) ? 'formed' : 'forming',
    worldCompleteness: (vis[0] + vis[1] + vis[2]) / 3,
    languagePresence: Math.max(s.heroEyebrowOpacity, s.heroLifeOpacity, s.heroMachinesOpacity, s.heroEnvironmentsOpacity, s.heroConclusionOpacity),
  };
}

export function describeE03(p: number, isMobile: boolean): E03Semantics {
  const d = computeDominance(p);
  const { labels } = computeExperience03State(p, isMobile);
  let phase: E03Phase = 'neutral';
  if (labels.statementPrimary > 0 || labels.statementFinal > 0) phase = 'relationship-statement';
  else {
    const max = Math.max(d.life, d.machine, d.environment);
    if (max >= 0.5) phase = d.life === max ? 'life-focus' : d.machine === max ? 'machine-focus' : 'environment-focus';
  }
  return { phase, dominance: d, statement: { supporting: labels.statementPrimary, payoff: labels.statementFinal } };
}

export function describe(segment: Segment, p02: number, p03: number, isMobile: boolean, reducedMotion: boolean, p04 = 0): SemanticDescriptor {
  // Reduced motion: E02's local logic presents the settled world (progress 1) regardless of scroll.
  const e02 = describeE02(reducedMotion ? 1 : p02, isMobile);
  const e03 = describeE03(p03, isMobile);
  let label: string;
  switch (segment) {
    case 'e01': label = 'e01:void'; break;
    case 'e02': label = `e02:${e02.phase}`; break;
    case 'legacy-transition': label = 'legacy-transition'; break;
    case 'e03': label = `e03:${e03.phase}`; break;
    case 'e04-handoff': label = 'e04:handoff'; break;
    case 'e04': label = `e04:${e04PhaseAt(p04)}`; break;
    default: label = 'after-e03';
  }
  const e04: E04Semantics = { phase: segment === 'e04' ? e04PhaseAt(p04) : 'not-started' };
  return { segment, label, e02, e03, e04 };
}
