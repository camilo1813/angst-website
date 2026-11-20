import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { useFrame } from '@react-three/fiber';
import type { ScrollProgressState } from '../../lib/scrollProgress';
import {
  computeExperience04State, machineLevels, environmentValues, cadenceSchedule, cadenceEnvelope,
  e04FinalFragments, RECORD_COMPLETE_P, type SystemId, type Experience04State,
} from '../../lib/experience04Maps';
import { ANCHOR_IDS, anchorWorld, projectAnchor, type AnchorId, type ProjectedAnchor } from '../../lib/observationAnchors';

/**
 * EXPERIENCE 04 — the observation layer: INFORMATION ABOUT the physical world.
 *
 * One SVG, mounted inside the persistent world host directly above the one canvas (same box, so it
 * rides every slot move with the world). It draws nothing physical: only what three independent
 * observation systems know, attached to physical anchors projected through the ONE persistent camera.
 * Three.js keeps owning the world; this layer never touches it.
 */

export interface ProjectionStore {
  key: number[];
  size: { w: number; h: number };
  anchors: Record<AnchorId, ProjectedAnchor> | null;
  listeners: Set<() => void>;
  writes: number;
}

export function createProjectionStore(): ProjectionStore {
  return { key: [], size: { w: 0, h: 0 }, anchors: null, listeners: new Set(), writes: 0 };
}

/**
 * Inside the Canvas: projects the observation anchors through the persistent camera. The E04 camera
 * is static, so this writes only when the camera matrices, the canvas size or the breakpoint change.
 */
export function ObservationProjector({ active, isMobile, store }: { active: boolean; isMobile: boolean; store: ProjectionStore }) {
  useFrame(({ camera, size }) => {
    if (!active) return;
    camera.updateMatrixWorld();
    const pm = camera.projectionMatrix.elements, mw = camera.matrixWorld.elements;
    const k = store.key;
    let changed = k.length !== 35 || k[32] !== size.width || k[33] !== size.height || k[34] !== (isMobile ? 1 : 0);
    if (!changed) for (let i = 0; i < 16; i++) if (k[i] !== pm[i] || k[16 + i] !== mw[i]) { changed = true; break; }
    if (!changed) return;
    store.key = [...pm, ...mw, size.width, size.height, isMobile ? 1 : 0];
    store.size = { w: size.width, h: size.height };
    store.anchors = Object.fromEntries(ANCHOR_IDS.map((id) => [id, projectAnchor(id, isMobile, camera, size.width, size.height)])) as Record<AnchorId, ProjectedAnchor>;
    store.writes++;
    store.listeners.forEach((l) => l());
  });
  return null;
}

const BLUE = '#8bcbff';     // --color-signal: observed / reported information (cold blue)
const DIM = '#6d8396';      // dim but steady: an earlier observation, not in focus
const GREY = '#5b6066';     // records / uncertainty
const RECORD = '#9aa0a6';   // --color-grey-300: M / E local records (neutral grey, not blue)
const VOID = '#050607';     // --color-void: a thin ground under M / E marks, separating them from world points (no glow)

/** Deterministic jitter (uncertainty) per environmental sample, ±0.5 px. */
const E_JITTER = [0.4, -0.5, 0.2, -0.3];

interface LayerProps {
  e04: ScrollProgressState;
  isMobile: boolean;
  reducedMotion: boolean;
  /** Real-time cadence may run (E04 near, tab visible, world rendering). */
  live: boolean;
  store: ProjectionStore;
}

export default function ObservationLayer({ e04, isMobile, reducedMotion, live, store }: LayerProps) {
  const [, force] = useState(0);
  useEffect(() => {
    const l = () => force((n) => n + 1);
    store.listeners.add(l);
    return () => { store.listeners.delete(l); };
  }, [store]);

  const state: Experience04State = useMemo(() => computeExperience04State(e04.progress, isMobile, reducedMotion), [e04.progress, isMobile, reducedMotion]);
  const latest = useRef(state);
  latest.current = state;
  useEffect(() => {
    // Non-visual QA / E05 hook (like window.__angstStory): the live E04 state, projected anchors and
    // the deterministic fragment contract.
    (window as unknown as Record<string, unknown>).__angstE04 = {
      getState: () => latest.current,
      anchors: () => store.anchors,
      size: () => store.size,
      projectionWrites: () => store.writes,
      fragments: () => e04FinalFragments(isMobile),
      anchorWorlds: () => Object.fromEntries(ANCHOR_IDS.map((id) => [id, anchorWorld(id, isMobile)])),
      isMobile,
    };
  }, [store, isMobile]);

  const a = store.anchors;
  const { w, h } = store.size;
  // Short desktop (≤ 900 CSS px tall): the same marks fill a larger share of a sparser frame —
  // the measured blue share at 1366×768 exceeded the 6 % cap, so blue accents are attenuated here.
  const qaw = window as unknown as Record<string, unknown>;
  const short = !isMobile && h > 0 && h < 900 && !(qaw.__ANGST_STORY_QA__ === true && qaw.__ANGST_E04_NO_SHORT_CORRECTION__ === true);
  const blueK = short ? 0.62 : 1;
  // Each system's CURRENT REACH (what it is observing now) is steady cold blue; older records stay dim/grey.
  const reachK = short ? 0.84 : 1;
  const s = isMobile ? 0.75 : 1;

  // ---- real-time FINAL-HOLD cadence: only the existing newest mark of each system brightens.
  const newestRefs = useRef<Record<SystemId, SVGElement | null>>({ v: null, m: null, e: null });
  const holdActive = live && !reducedMotion && state.recordComplete && state.progress >= RECORD_COMPLETE_P;
  useEffect(() => {
    if (!holdActive) {
      (['v', 'm', 'e'] as SystemId[]).forEach((id) => newestRefs.current[id]?.style.removeProperty('opacity'));
      return;
    }
    const w = window as unknown as Record<string, unknown>;
    const qa = w.__ANGST_STORY_QA__ === true;
    if (qa && !Array.isArray(w.__angstE04CadenceLog)) w.__angstE04CadenceLog = [];
    const t0 = performance.now();
    const schedule = cadenceSchedule(10 * 60 * 1000);
    let idx = 0;
    let raf = 0;
    const lastStart: Record<SystemId, number> = { v: -1e9, m: -1e9, e: -1e9 };
    const tick = () => {
      const t = performance.now() - t0;
      while (idx < schedule.length && schedule[idx].t <= t) {
        lastStart[schedule[idx].system] = schedule[idx].t;
        const log = qa ? (w.__angstE04CadenceLog as Array<{ system: SystemId; t: number }> | undefined) : undefined;
        if (log && log.length < 500) log.push({ system: schedule[idx].system, t: schedule[idx].t });
        idx++;
      }
      (['v', 'm', 'e'] as SystemId[]).forEach((id) => {
        const el = newestRefs.current[id];
        if (!el) return;
        const env = cadenceEnvelope(t - lastStart[id]);
        // Write only when the (quantised) value changes: between pulses nothing is invalidated.
        const v = (Math.round((0.62 + 0.38 * env) * 200) / 200).toFixed(3);
        if (el.style.opacity !== v) el.style.opacity = v;
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [holdActive]);

  if (!a || w === 0 || state.progress <= 0) return <svg className="e04-observations" aria-hidden="true" />;

  const V = state.systems.v, M = state.systems.m, E = state.systems.e;
  const els: ReactElement[] = [];
  // Newest-mark base opacity: during the hold the cadence modulates it (0.62 → 1); otherwise steady 0.9.
  const newestBase = holdActive ? 0.62 : 0.9;

  // ---------------- V — vision-like: observes PART of a living presence ----------------
  const O = a['v.origin'], U = a['v.reach.upper'], L = a['v.reach.lower'];
  if (V.source > 0 && O.visible) {
    if (V.count > 0 && U.visible && L.visible) {
      const rayO = 0.085 + 0.12 * V.pulse; // visual-strength pass: V −15 % (still the first read)
      els.push(<line key="v-ray-u" data-obs="v-ray" x1={O.x} y1={O.y} x2={U.x} y2={U.y} stroke={BLUE} strokeWidth={1} opacity={rayO * V.source} />);
      els.push(<line key="v-ray-l" data-obs="v-ray" x1={O.x} y1={O.y} x2={L.x} y2={L.y} stroke={BLUE} strokeWidth={1} opacity={rayO * V.source} />);
      // The boundary of what it sees, bulging away from the source: it cuts ACROSS the figure.
      const mx = (U.x + L.x) / 2, my = (U.y + L.y) / 2;
      const dx = mx - O.x, dy = my - O.y, len = Math.hypot(dx, dy) || 1;
      const bulge = 0.12 * Math.hypot(L.x - U.x, L.y - U.y);
      const cx = mx + (dx / len) * bulge, cy = my + (dy / len) * bulge;
      const d = `M${U.x.toFixed(2)},${U.y.toFixed(2)} Q${cx.toFixed(2)},${cy.toFixed(2)} ${L.x.toFixed(2)},${L.y.toFixed(2)}`;
      els.push(<path key="v-bound" data-obs="v-boundary" d={d} fill="none" stroke={BLUE} strokeWidth={1.3} opacity={0.44 * reachK * V.source} />);
      if (V.pulse > 0) els.push(<path key="v-bound-p" data-obs="v-boundary-pulse" d={d} fill="none" stroke={BLUE} strokeWidth={1.4} opacity={0.3 * V.pulse * blueK} />);
    }
    els.push(<circle key="v-o" data-obs="v-origin" data-anchor="v.origin" cx={O.x} cy={O.y} r={2.4 * s + 0.6} fill="none" stroke={BLUE} strokeWidth={1.2} opacity={V.source * (0.7 + 0.3 * V.pulse) * blueK} />);
    // V's own record: evenly spaced ticks (regular, frequent sampling).
    if (V.count > 0) {
      const x0 = O.x + 14 * s, y0 = O.y + 16 * s, step = isMobile ? 3.4 : 5.2, th = 5 * s;
      els.push(<line key="v-rec" data-obs="v-record" x1={x0 - 2} y1={y0} x2={x0 + (V.count - 1) * step + 2} y2={y0} stroke={GREY} strokeWidth={1} opacity={0.45} />);
      for (let i = 0; i < V.count; i++) {
        const newest = i === V.newest;
        els.push(<line key={`v-t${i}`} data-obs="v-tick" data-newest={newest ? '1' : undefined} ref={newest ? (el) => { newestRefs.current.v = el; } : undefined}
          x1={x0 + i * step} y1={y0 - th} x2={x0 + i * step} y2={y0 + 1} stroke={newest ? BLUE : DIM} strokeWidth={1} opacity={newest ? newestBase * blueK : 0.55} />);
      }
    }
  }

  // ---------------- M — machine reports its own state (discrete, irregular) ----------------
  const A = a['m.axisTop'];
  if (M.source > 0 && A.visible) {
    if (M.count > 0) {
      // Visual-strength pass: longer, heavier state mark (+50 % length, +30 % stroke) on a thin void ground.
      const mh = isMobile ? 24 : 36;
      els.push(<line key="m-mark-g" data-obs="m-state-ground" x1={A.x} y1={A.y - 4} x2={A.x} y2={A.y - mh} stroke={VOID} strokeWidth={5} strokeLinecap="round" opacity={0.85 * M.source} />);
      els.push(<line key="m-mark" data-obs="m-state" x1={A.x} y1={A.y - 4} x2={A.x} y2={A.y - mh} stroke={BLUE} strokeWidth={isMobile ? 1.6 : 1.8} opacity={0.5 * reachK * M.source} />);
      if (M.pulse > 0) els.push(<line key="m-mark-p" data-obs="m-state-pulse" x1={A.x} y1={A.y - 4} x2={A.x} y2={A.y - mh} stroke={BLUE} strokeWidth={isMobile ? 1.6 : 1.8} opacity={0.35 * M.pulse * blueK} />);
      // M's own record: a step-line on its own local time scale (wider, taller steps, neutral grey).
      const x0 = A.x + 14 * s, y0 = A.y + 16 * s, W = isMobile ? 60 : 160, unit = isMobile ? 5 : 9;
      const xs = (pp: number) => x0 + (W * (Math.min(pp, RECORD_COMPLETE_P) - 0.3)) / (RECORD_COMPLETE_P - 0.3);
      const lv = machineLevels(M.count);
      let d = `M${x0.toFixed(2)},${y0.toFixed(2)}`;
      M.events.forEach((ev, i) => { d += ` H${xs(ev).toFixed(2)} V${(y0 + lv[i + 1] * unit).toFixed(2)}`; });
      const xNow = xs(state.progress);
      d += ` H${xNow.toFixed(2)}`;
      els.push(<path key="m-rec" data-obs="m-record" d={d} fill="none" stroke={RECORD} strokeWidth={isMobile ? 1.2 : 1.6} opacity={0.8} />);
      const ex = xs(M.events[M.newest]), ey = y0 + lv[M.count] * unit;
      els.push(<circle key="m-new" data-obs="m-step" data-newest="1" ref={(el) => { newestRefs.current.m = el; }} cx={ex} cy={ey} r={isMobile ? 1.8 : 2.6} fill={BLUE} opacity={newestBase * blueK} />);
    }
    els.push(<circle key="m-o" data-obs="m-origin" data-anchor="m.axisTop" cx={A.x} cy={A.y} r={isMobile ? 2.3 : 3} fill={BLUE} opacity={M.source * (0.6 + 0.4 * M.pulse) * blueK} />);
  }

  // ---------------- E — a local environmental condition (slow, uncertain) ----------------
  const Z = a['e.zone'];
  if (E.source > 0 && Z.visible) {
    // Visual-strength pass: larger open arc (r +40 %, span 110° → 130°), heavier stroke, on a thin void ground.
    // Still OPEN (never a ring), single, static: an environmental zone, not a radar.
    const r = isMobile ? 22 : 62;
    const p0 = (-210 * Math.PI) / 180, p1 = (-80 * Math.PI) / 180;
    const arc = `M${(Z.x + r * Math.cos(p0)).toFixed(2)},${(Z.y + r * Math.sin(p0)).toFixed(2)} A${r},${r} 0 0 1 ${(Z.x + r * Math.cos(p1)).toFixed(2)},${(Z.y + r * Math.sin(p1)).toFixed(2)}`;
    // The arc stays grey until the first sample; from then on it is E's current reach (steady cold blue).
    const ew = isMobile ? 1.5 : 1.9;
    els.push(<path key="e-arc-g" data-obs="e-zone-ground" d={arc} fill="none" stroke={VOID} strokeWidth={ew + 3} strokeLinecap="round" opacity={0.85 * E.source} />);
    // The open arc = the zone's extent (neutral grey). Its CURRENT REACH is a 50° blue segment on that arc
    // (after the first sample): E reads only part of its zone — uncertain, partial, environmental.
    els.push(<path key="e-arc" data-obs="e-zone-arc" d={arc} fill="none" stroke={RECORD} strokeWidth={ew} strokeLinecap="round" opacity={0.55 * E.source} />);
    const q0 = (-160 * Math.PI) / 180, q1 = (-110 * Math.PI) / 180;
    const reach = `M${(Z.x + r * Math.cos(q0)).toFixed(2)},${(Z.y + r * Math.sin(q0)).toFixed(2)} A${r},${r} 0 0 1 ${(Z.x + r * Math.cos(q1)).toFixed(2)},${(Z.y + r * Math.sin(q1)).toFixed(2)}`;
    if (E.count > 0) els.push(<path key="e-reach" data-obs="e-zone-reach" d={reach} fill="none" stroke={BLUE} strokeWidth={ew} strokeLinecap="round" opacity={0.5 * reachK * E.source} />);
    if (E.pulse > 0) els.push(<path key="e-arc-p" data-obs="e-zone-arc-pulse" d={reach} fill="none" stroke={BLUE} strokeWidth={ew} opacity={0.35 * E.pulse * blueK} />);
    els.push(<circle key="e-o" data-obs="e-origin" data-anchor="e.zone" cx={Z.x} cy={Z.y} r={isMobile ? 2 : 2.6} fill={BLUE} opacity={E.source * (0.6 + 0.4 * E.pulse) * blueK} />);
    if (E.count > 0) {
      // E's own record: a few uncertain values (grey, with an uncertainty whisker per sample).
      // Wider spacing, larger value excursion and uncertainty whiskers, neutral grey (uncertain, not blue).
      const x0 = Z.x - (isMobile ? 66 : 230), y0 = Z.y - (isMobile ? 36 : 74), dx = isMobile ? 15 : 46, unit = isMobile ? 5 : 10, wh = isMobile ? 4 : 7;
      const vals = environmentValues(E.count);
      const pts = vals.map((v, i) => [x0 + i * dx, y0 + v * unit + E_JITTER[i]] as const);
      const ptsAttr = pts.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' ');
      if (pts.length > 1) {
        els.push(<polyline key="e-rec" data-obs="e-record" points={ptsAttr} fill="none" stroke={RECORD} strokeWidth={isMobile ? 1.1 : 1.5} strokeDasharray={isMobile ? '3 2' : '5 3'} opacity={0.8} />);
      }
      pts.forEach(([x, y], i) => {
        const newest = i === E.newest;
        els.push(<line key={`e-u${i}`} data-obs="e-uncertainty" x1={x} y1={y - wh} x2={x} y2={y + wh} stroke={RECORD} strokeWidth={isMobile ? 1.1 : 1.3} opacity={0.6} />);
        els.push(<circle key={`e-s${i}`} data-obs="e-sample" data-newest={newest ? '1' : undefined} ref={newest ? (el) => { newestRefs.current.e = el; } : undefined}
          cx={x} cy={y} r={isMobile ? 1.7 : 2.6} fill={newest ? BLUE : RECORD} opacity={newest ? newestBase * blueK : 0.7} />);
      });
    }
  }

  return (
    <svg className="e04-observations" aria-hidden="true" width={w} height={h} viewBox={`0 0 ${w} ${h}`} data-e04-phase={state.phase}>
      {els}
    </svg>
  );
}

/** QA / E05: the fragments E04 leaves behind (deterministic). */
export { e04FinalFragments };
