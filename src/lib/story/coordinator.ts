// Shared story coordinator — RUNTIME (P1: SHADOW MODE).
//
// One passive scroll listener, one resize listener, one ResizeObserver; work is scheduled
// in a single requestAnimationFrame only when something changed (no perpetual loop).
// It measures the page once, derives E02/E03 progress + semantic descriptors and publishes
// immutable snapshots. In P1 NOTHING renders from it: E02/E03 keep their own controllers.
//
// Exposed for QA/debugging (non-visual): window.__angstStory

import { computeSceneValues } from '../sceneMaps';
import {
  type SectionGeometry, type ViewportState, type Segment,
  sectionProgress, segmentAt, sectionNear, progressSensitivity,
} from './geometry';
import { describe, type SemanticDescriptor } from './semantics';

export const STORY_COORDINATOR_VERSION = 'p1-shadow-1';

export interface StorySnapshot {
  version: string;
  frame: number;
  viewport: ViewportState;
  mode: { isMobile: boolean; reducedMotion: boolean; webgl: boolean };
  sections: { e01: SectionGeometry; e02: SectionGeometry; e03: SectionGeometry };
  progress: { e02: number; e03: number };
  near: { e02: boolean; e03: boolean };
  segment: Segment;
  activeSection: 'e01' | 'e02' | 'e03' | null;
  semantic: SemanticDescriptor;
  /** Viewport-height dependence of the current state (see geometry.progressSensitivity). */
  viewportDependence: {
    e02: { perPxInnerHeight: number; perPxViewport: number };
    e03: { perPxInnerHeight: number; perPxViewport: number };
    /** innerHeight change (px, svh fixed) that would flip the semantic label; null = no flip within ±160 px. Computed when idle. */
    flipMarginPx: { shrink: number | null; grow: number | null } | null;
  };
}

export interface StoryDiagnostics {
  measures: number;
  frames: number;
  resizes: number;
  /** Semantic label changed by a viewport resize while scrollY stayed constant. */
  resizeInducedSemanticFlips: Array<{ from: string; to: string; innerHeight: [number, number]; scrollY: number }>;
}

type Listener = (s: StorySnapshot) => void;

const MOBILE_QUERY = '(max-width: 640px)';
const RM_QUERY = '(prefers-reduced-motion: reduce)';

function measureSection(sel: string, id: SectionGeometry['id']): SectionGeometry | null {
  const el = document.querySelector(sel);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { id, top: r.top + window.scrollY, height: r.height };
}

function computeFlipMargin(snapshotFn: (ih: number) => string, baseIH: number, current: string) {
  let shrink: number | null = null, grow: number | null = null;
  for (let d = 2; d <= 160; d += 2) {
    if (shrink === null && snapshotFn(baseIH - d) !== current) shrink = d;
    if (grow === null && snapshotFn(baseIH + d) !== current) grow = d;
    if (shrink !== null && grow !== null) break;
  }
  return { shrink, grow };
}

export function createStoryCoordinator() {
  const listeners = new Set<Listener>();
  const mobileMq = window.matchMedia(MOBILE_QUERY);
  const rmMq = window.matchMedia(RM_QUERY);
  let sections: StorySnapshot['sections'] | null = null;
  let svhPx = window.innerHeight;
  let snapshot: StorySnapshot | null = null;
  let rafId: number | null = null;
  let needsMeasure = true;
  let idleTimer: number | null = null;
  let lastIH = window.innerHeight;
  const diagnostics: StoryDiagnostics = { measures: 0, frames: 0, resizes: 0, resizeInducedSemanticFlips: [] };

  const measure = () => {
    const e01 = measureSection('#the-void', 'e01');
    const e02 = measureSection('[data-e02-section]', 'e02');
    const e03 = measureSection('[data-e03-section]', 'e03');
    if (!e01 || !e02 || !e03) return false;
    sections = { e01, e02, e03 };
    const stage = document.querySelector('.e02-stage');
    svhPx = stage ? stage.getBoundingClientRect().height : window.innerHeight;
    diagnostics.measures++;
    needsMeasure = false;
    return true;
  };

  const compute = (): StorySnapshot | null => {
    if (needsMeasure && !measure()) return null;
    if (!sections) return null;
    const ih = window.innerHeight;
    const vp: ViewportState = {
      innerWidth: window.innerWidth, innerHeight: ih,
      visualHeight: window.visualViewport ? window.visualViewport.height : ih,
      svhPx, scrollY: window.scrollY,
      maxScroll: document.documentElement.scrollHeight - ih,
    };
    const isMobile = mobileMq.matches;
    const reducedMotion = rmMq.matches;
    const p02 = sectionProgress(vp.scrollY, sections.e02, ih);
    const p03 = sectionProgress(vp.scrollY, sections.e03, ih);
    const segment = segmentAt(vp.scrollY, sections.e02, sections.e03, ih);
    const semantic = describe(segment, p02, p03, isMobile, reducedMotion);
    return {
      version: STORY_COORDINATOR_VERSION,
      frame: ++diagnostics.frames,
      viewport: vp,
      mode: { isMobile, reducedMotion, webgl: !document.documentElement.classList.contains('no-webgl') },
      sections,
      progress: { e02: p02, e03: p03 },
      near: { e02: sectionNear(vp.scrollY, sections.e02, ih), e03: sectionNear(vp.scrollY, sections.e03, ih) },
      segment,
      activeSection: segment === 'e01' ? 'e01' : segment === 'e02' ? 'e02' : segment === 'e03' ? 'e03' : null,
      semantic,
      viewportDependence: {
        e02: progressSensitivity(vp.scrollY, sections.e02, vp),
        e03: progressSensitivity(vp.scrollY, sections.e03, vp),
        flipMarginPx: null,
      },
    };
  };

  const publish = () => {
    rafId = null;
    const prev = snapshot;
    const next = compute();
    if (!next) return;
    // A resize changed the semantic state without the visitor scrolling: record it (P0 mobile risk).
    if (prev && next.viewport.innerHeight !== lastIH && prev.viewport.scrollY === next.viewport.scrollY && prev.semantic.label !== next.semantic.label) {
      diagnostics.resizeInducedSemanticFlips.push({ from: prev.semantic.label, to: next.semantic.label, innerHeight: [lastIH, next.viewport.innerHeight], scrollY: next.viewport.scrollY });
      if (diagnostics.resizeInducedSemanticFlips.length > 50) diagnostics.resizeInducedSemanticFlips.shift();
    }
    lastIH = next.viewport.innerHeight;
    snapshot = next;
    listeners.forEach((l) => { try { l(next); } catch { /* listeners must never break the page */ } });
    scheduleIdle();
  };

  // Expensive-ish analysis (semantic flip margin) only once the page is still.
  const scheduleIdle = () => {
    if (idleTimer !== null) window.clearTimeout(idleTimer);
    idleTimer = window.setTimeout(() => {
      idleTimer = null;
      if (!snapshot || !sections) return;
      const s = snapshot, secs = sections;
      // Model: svh-sized sections keep their height (real mobile toolbar behaviour) while innerHeight
      // changes; the browser clamps scrollY to the new maximum, exactly as it would on a real device.
      const docHeight = s.viewport.maxScroll + s.viewport.innerHeight;
      const labelAt = (ih: number) => {
        const y = Math.min(s.viewport.scrollY, Math.max(0, docHeight - ih));
        const p02 = sectionProgress(y, secs.e02, ih);
        const p03 = sectionProgress(y, secs.e03, ih);
        return describe(segmentAt(y, secs.e02, secs.e03, ih), p02, p03, s.mode.isMobile, s.mode.reducedMotion).label;
      };
      snapshot = { ...s, viewportDependence: { ...s.viewportDependence, flipMarginPx: computeFlipMargin(labelAt, s.viewport.innerHeight, s.semantic.label) } };
    }, 250);
  };

  const schedule = () => { if (rafId === null) rafId = window.requestAnimationFrame(publish); };
  const remeasure = () => { needsMeasure = true; schedule(); };
  const onResize = () => { diagnostics.resizes++; remeasure(); };

  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', onResize, { passive: true });
  window.visualViewport?.addEventListener('resize', onResize, { passive: true });
  mobileMq.addEventListener('change', remeasure);
  rmMq.addEventListener('change', schedule);
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(remeasure) : null;
  ['#the-void', '[data-e02-section]', '[data-e03-section]'].forEach((sel) => { const el = document.querySelector(sel); if (el && ro) ro.observe(el); });
  window.addEventListener('load', remeasure, { once: true });
  document.fonts?.ready.then(remeasure).catch(() => {});
  schedule();

  return {
    version: STORY_COORDINATOR_VERSION,
    getSnapshot: () => snapshot,
    getDiagnostics: () => diagnostics,
    subscribe(l: Listener) { listeners.add(l); if (snapshot) l(snapshot); return () => listeners.delete(l); },
    /** Force a synchronous measure + publish (QA). */
    refresh() { needsMeasure = true; if (rafId !== null) { window.cancelAnimationFrame(rafId); } publish(); return snapshot; },
    /** Pure helper exposed for QA: what E02 scene values the coordinator implies right now. */
    impliedE02Scene: () => (snapshot ? computeSceneValues(snapshot.mode.reducedMotion ? 1 : snapshot.progress.e02, snapshot.mode.isMobile) : null),
    destroy() {
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', onResize);
      window.visualViewport?.removeEventListener('resize', onResize);
      mobileMq.removeEventListener('change', remeasure);
      rmMq.removeEventListener('change', schedule);
      ro?.disconnect();
      if (rafId !== null) window.cancelAnimationFrame(rafId);
      if (idleTimer !== null) window.clearTimeout(idleTimer);
      listeners.clear();
    },
  };
}

export type StoryCoordinator = ReturnType<typeof createStoryCoordinator>;
