// Pure, deterministic derivations from Experience 04's own single progress value (0 → 1).
// Same contract as sceneMaps.ts / experience03Maps.ts: nothing here holds state, so scrolling
// backward reproduces exactly the same output.
//
// EXPERIENCE 04 — FRAGMENTED OBSERVATION ("Independent Witnesses", design report 14).
// The physical world is NOT touched by E04: it stays exactly at Experience 03's final frame.
// What E04 adds is INFORMATION ABOUT that world, from three independent observation systems:
//
//   V  vision-like      — observes a spatial region: part of a living presence (sees only part)
//   M  machine-state    — the machine reports its own state (discrete, irregular)
//   E  environment      — a local condition of a zone of environmental matter (slow, uncertain)
//
// Each system has its OWN sampling schedule (never simultaneous with another system), its OWN
// local temporal record (never aligned, never linked), and leaves persistent fragments that E05
// may later align / test — E04 performs none of those operations.

import { mapRange } from './scrollProgress';

export type SystemId = 'v' | 'm' | 'e';
export const SYSTEMS: readonly SystemId[] = ['v', 'm', 'e'] as const;

/** Observation events (E04 progress) per system. Desktop V samples 14×; mobile V 11× (clarity). */
const V_DESKTOP = Array.from({ length: 14 }, (_, k) => round4(0.12 + 0.052 * k)); // 0.120 … 0.796
const V_MOBILE = Array.from({ length: 11 }, (_, k) => round4(0.135 + 0.0577 * k)); // 0.135 … 0.712
const M_EVENTS = [0.35, 0.505, 0.56, 0.725];
const E_EVENTS = [0.468, 0.573, 0.678, 0.783];

/** Machine-state levels after each event (relative units; the step record's shape). */
const M_LEVELS = [0, -1, -1, 0, 0.5];
/** Environment sample values (relative, ±1) — a slow, uncertain local condition. */
const E_VALUES = [0, -0.75, 0.35, -0.25];

function round4(v: number) {
  return Math.round(v * 10000) / 10000;
}

export function eventsFor(system: SystemId, isMobile: boolean): number[] {
  if (system === 'v') return isMobile ? V_MOBILE : V_DESKTOP;
  return system === 'm' ? M_EVENTS : E_EVENTS;
}

/** Progress at which each system's source becomes present (fades in just before its first observation). */
export const SOURCE_APPEAR: Record<SystemId, [number, number]> = { v: [0.08, 0.1], m: [0.31, 0.33], e: [0.43, 0.45] };

/** Last scroll-mapped event of any system; from here on the record no longer changes. */
export const RECORD_COMPLETE_P = 0.8;
/** Copy windows. */
export const COPY_LINE1: [number, number] = [0.88, 0.91];
export const COPY_LINE2: [number, number] = [0.94, 0.97];
/** Minimum progress distance between any two different systems' events (QA contract). */
export const MIN_INTERSYSTEM_SEPARATION = 0.012;

/**
 * One observation pulse envelope in scroll units: rises over Δp 0.004, then decays with a
 * half-life of Δp 0.006 (≈ 0.09 left after Δp 0.025). Zero before the event.
 */
export function pulseEnvelope(d: number): number {
  if (d < 0) return 0;
  if (d < 0.004) return d / 0.004;
  const v = Math.pow(0.5, (d - 0.004) / 0.006);
  return v < 0.02 ? 0 : v;
}

export type E04Phase = 'quiet' | 'first-observation' | 'single-source' | 'second-source' | 'third-source' | 'independent-rhythms' | 'fragments' | 'statement' | 'unresolved';

export function phaseAt(p: number): E04Phase {
  if (p < 0.08) return 'quiet';
  if (p < 0.12) return 'first-observation';
  if (p < 0.3) return 'single-source';
  if (p < 0.44) return 'second-source';
  if (p < 0.56) return 'third-source';
  if (p < RECORD_COMPLETE_P) return 'independent-rhythms';
  if (p < COPY_LINE1[0]) return 'fragments';
  if (p < 0.98) return 'statement';
  return 'unresolved';
}

export interface SystemState {
  /** Source presence 0..1 (the origin). */
  source: number;
  /** Number of observations made so far (= marks in this system's own record). */
  count: number;
  /** Event progress of each observation made so far. */
  events: number[];
  /** Pulse strength of the most recent observation (0 when settled; 0 under reduced motion). */
  pulse: number;
  /** Index of the newest observation, or -1. */
  newest: number;
}

export interface Experience04State {
  progress: number;
  phase: E04Phase;
  systems: Record<SystemId, SystemState>;
  copy: { line1: number; line2: number };
  /** True once no further observation will be added by scrolling (the record is complete). */
  recordComplete: boolean;
}

/**
 * Reduced motion: the same observations exist, but appear in DISCRETE steps without pulse
 * envelopes. The final state (marks, kinds, positions) is identical to normal mode.
 */
const RM_STEPS: Record<SystemId, number[]> = { v: [0.12, 0.3, 0.56], m: [0.35, 0.725], e: [0.468, 0.783] };

export function computeExperience04State(progress: number, isMobile = false, reducedMotion = false): Experience04State {
  const p = Math.min(1, Math.max(0, progress));
  const systems = {} as Record<SystemId, SystemState>;
  for (const id of SYSTEMS) {
    const all = eventsFor(id, isMobile);
    let made: number[];
    if (reducedMotion) {
      // Stepped reveal: at each step, every observation up to the NEXT step's time (or all) appears at once.
      const steps = RM_STEPS[id];
      let k = -1;
      for (let i = 0; i < steps.length; i++) if (p >= steps[i]) k = i;
      const until = k < 0 ? -1 : k + 1 < steps.length ? steps[k + 1] - 1e-9 : Infinity;
      made = k < 0 ? [] : all.filter((e) => e <= until);
    } else {
      made = all.filter((e) => e <= p);
    }
    const [a0, a1] = SOURCE_APPEAR[id];
    const source = reducedMotion ? (made.length ? 1 : 0) : mapRange(p, a0, a1, 0, 1);
    const newest = made.length - 1;
    const pulse = reducedMotion || newest < 0 ? 0 : pulseEnvelope(p - made[newest]);
    systems[id] = { source, count: made.length, events: made, pulse, newest };
  }
  return {
    progress: p,
    phase: phaseAt(p),
    systems,
    copy: { line1: mapRange(p, COPY_LINE1[0], COPY_LINE1[1], 0, 1), line2: mapRange(p, COPY_LINE2[0], COPY_LINE2[1], 0, 1) },
    recordComplete: p >= RECORD_COMPLETE_P,
  };
}

/** Level of the machine-state record after `count` events. */
export function machineLevels(count: number): number[] {
  return M_LEVELS.slice(0, count + 1);
}

/** Environment sample values for the first `count` samples. */
export function environmentValues(count: number): number[] {
  return E_VALUES.slice(0, count);
}

// ---------------------------------------------------------------------------------------------
// FINAL-HOLD REAL-TIME CADENCE (approved): once the record is complete, each system keeps
// observing at its OWN real-time rhythm. A cadence pulse only brightens the system's EXISTING
// newest mark — it never adds a mark, never extends a record, never moves anything.
// ---------------------------------------------------------------------------------------------

/** Real-time rhythms (ms): V regular, M irregular (alternating), E slow. Phase offsets avoid starting together. */
export const CADENCE: Record<SystemId, { intervals: number[]; offset: number }> = {
  v: { intervals: [1250], offset: 0 },
  m: { intervals: [2600, 4100], offset: 550 },
  e: { intervals: [3500], offset: 1900 },
};
/** Two systems' cadence pulses never start within this many ms of each other (the later one waits). */
export const CADENCE_MIN_GAP_MS = 300;
/** Real-time pulse envelope: rise 120 ms, decay half-life 220 ms (≈ 0 after ~900 ms). */
export function cadenceEnvelope(ms: number): number {
  if (ms < 0) return 0;
  if (ms < 120) return ms / 120;
  const v = Math.pow(0.5, (ms - 120) / 220);
  return v < 0.02 ? 0 : v;
}

/**
 * Deterministic cadence schedule from t = 0 (entering the final hold) to `untilMs`: the start
 * times of every system's pulses, after enforcing CADENCE_MIN_GAP_MS between systems.
 */
export function cadenceSchedule(untilMs: number): Array<{ system: SystemId; t: number }> {
  const next: Record<SystemId, { t: number; i: number }> = {
    v: { t: CADENCE.v.offset, i: 0 }, m: { t: CADENCE.m.offset, i: 0 }, e: { t: CADENCE.e.offset, i: 0 },
  };
  const out: Array<{ system: SystemId; t: number }> = [];
  let lastStart = -Infinity;
  for (let guard = 0; guard < 10000; guard++) {
    const id = SYSTEMS.reduce((a, b) => (next[b].t < next[a].t ? b : a));
    let t = next[id].t;
    if (t > untilMs) break;
    if (t - lastStart < CADENCE_MIN_GAP_MS) t = lastStart + CADENCE_MIN_GAP_MS; // never together
    out.push({ system: id, t });
    lastStart = t;
    const iv = CADENCE[id].intervals;
    next[id] = { t: t + iv[next[id].i % iv.length], i: next[id].i + 1 };
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// E04 → E05 CONTRACT: the deterministic list of fragments E04 leaves behind. E05 may align /
// map / test them; E04 never does.
// ---------------------------------------------------------------------------------------------

export interface ObservationFragment {
  systemId: SystemId;
  anchorId: string;
  sampleIndex: number;
  eventProgress: number;
  kind: 'tick' | 'step' | 'value';
  /** Relative value (step level / environmental value); null for vision ticks. */
  value: number | null;
  persisted: true;
}

export const SYSTEM_TARGET_ANCHOR: Record<SystemId, string> = { v: 'v.reach', m: 'm.axisTop', e: 'e.zone' };

export function e04FinalFragments(isMobile: boolean): ObservationFragment[] {
  const out: ObservationFragment[] = [];
  for (const id of SYSTEMS) {
    eventsFor(id, isMobile).forEach((ev, i) => {
      out.push({
        systemId: id,
        anchorId: SYSTEM_TARGET_ANCHOR[id],
        sampleIndex: i,
        eventProgress: ev,
        kind: id === 'v' ? 'tick' : id === 'm' ? 'step' : 'value',
        value: id === 'v' ? null : id === 'm' ? M_LEVELS[i + 1] : E_VALUES[i],
        persisted: true,
      });
    });
  }
  return out;
}
