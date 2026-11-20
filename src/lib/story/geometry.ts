// Shared story coordinator — GEOMETRY (pure functions, no DOM access).
//
// P1 (shadow mode): these functions reproduce, from one cached measurement of the
// page, exactly what each experience's local `computeSectionProgress` computes from
// its own live getBoundingClientRect(). They are the future single source of truth
// for scroll progress. P2A: E02/E03 now consume progress derived from these functions
// (see coordinator.ts / progressSource.ts); the legacy per-section path remains as rollback.

import { NEAR_MARGIN_FRACTION } from '../scrollProgress';

export type SectionId = 'e01' | 'e02' | 'e03' | 'e04';

export interface SectionGeometry {
  id: SectionId;
  /** Document-space top (px, sub-pixel precise). */
  top: number;
  /** Section height (px). */
  height: number;
}

export interface ViewportState {
  innerWidth: number;
  innerHeight: number;
  /** visualViewport height when available (differs from innerHeight while pinch-zoomed / keyboard open). */
  visualHeight: number;
  /** Height of one `100svh` box as laid out right now (measured from a sticky stage). */
  svhPx: number;
  scrollY: number;
  maxScroll: number;
}

/** Same contract as scrollProgress.computeSectionProgress: 0 at section top, 1 when its bottom meets the viewport bottom. */
export function sectionProgress(scrollY: number, s: SectionGeometry, innerHeight: number): number {
  const range = s.height - innerHeight;
  if (range <= 0) return 1;
  const raw = (scrollY - s.top) / range;
  return Math.min(1, Math.max(0, raw));
}

/** Un-clamped progress (useful to know how far before/after a section the viewport is). */
export function sectionProgressRaw(scrollY: number, s: SectionGeometry, innerHeight: number): number {
  const range = s.height - innerHeight;
  if (range <= 0) return 1;
  return (scrollY - s.top) / range;
}

export type Segment =
  | 'e01'                 // E01 on screen (incl. the unpinned travel while E02 slides in)
  | 'e02'                 // E02 sticky stage pinned
  | 'legacy-transition'   // unpinned E02→E03 boundary (desktop residual: E02 signal-hint echo leaving)
  | 'e03'                 // E03 sticky stage pinned
  | 'e04-handoff'         // E04: E03 has ended, its statement is scrolling out, E04 not yet pinned
  | 'e04'                 // E04 sticky stage pinned (and anything after it: E04 is the last section)
  | 'after-e03';          // after E03 on a page without E04

export function segmentAt(scrollY: number, e02: SectionGeometry, e03: SectionGeometry, innerHeight: number, e04?: SectionGeometry | null): Segment {
  const e02End = e02.top + Math.max(0, e02.height - innerHeight);
  const e03End = e03.top + Math.max(0, e03.height - innerHeight);
  if (scrollY < e02.top) return 'e01';
  // P4 (continuous geometry): E03's stage pins exactly where E02's pinned range ends, so the two
  // ranges can share one scroll position (E02 p=1 ≡ E03 p=0, the same world state). The pinned E03
  // stage owns that tie. With the P3 geometry e03.top > e02End and this line never applies.
  if (scrollY >= e03.top && scrollY <= e02End) return 'e03';
  if (scrollY <= e02End) return 'e02';
  if (scrollY < e03.top) return 'legacy-transition';
  if (scrollY <= e03End + 0.5) return 'e03';
  // E04 (FRAGMENTED OBSERVATION): the world stays at E03's final frame; E04 adds observations about it.
  if (e04) return scrollY < e04.top ? 'e04-handoff' : 'e04';
  return 'after-e03';
}

/** Whether a section's local scroll controller is currently live (same rule as scrollProgress: viewport ±25%). */
export function sectionNear(scrollY: number, s: SectionGeometry, innerHeight: number): boolean {
  const margin = innerHeight * NEAR_MARGIN_FRACTION;
  const viewTop = scrollY - margin;
  const viewBottom = scrollY + innerHeight + margin;
  return s.top < viewBottom && s.top + s.height > viewTop;
}

/**
 * Viewport-height dependence (the P0 mobile risk), expressed without changing behaviour.
 *
 *  perPxInnerHeight — dp per +1 px of innerHeight when `svh` stays fixed (real mobile browsers:
 *                     toolbar hides → innerHeight grows, svh-sized sections do not).
 *  perPxViewport    — dp per +1 px when the whole layout viewport (svh, section heights and tops)
 *                     scales together (desktop window resize / Playwright emulation).
 */
export function progressSensitivity(scrollY: number, s: SectionGeometry, vp: ViewportState) {
  const range = s.height - vp.innerHeight;
  const raw = range > 0 ? (scrollY - s.top) / range : 1;
  const perPxInnerHeight = range > 0 ? raw / range : 0;
  // svh-scaled model: top = a·svh, height = b·svh, innerHeight = svh (+ constant offset ignored)
  const svh = vp.svhPx || vp.innerHeight;
  const a = s.top / svh, b = s.height / svh, off = vp.innerHeight - svh;
  const p = (sv: number) => {
    const r = b * sv - (sv + off);
    return r > 0 ? (scrollY - a * sv) / r : 1;
  };
  const perPxViewport = (p(svh + 1) - p(svh - 1)) / 2;
  return { perPxInnerHeight, perPxViewport };
}

/**
 * P3: viewport-relative top of a section's sticky stage (height `stageHeight`, i.e. one 100svh box),
 * derived from the coordinator's cached geometry — no layout read. Positive while the stage is still
 * below the viewport top (section entering), 0 while pinned, negative once the section's end has
 * pushed the stage up (unpin travel / leaving).
 */
export function stageTop(scrollY: number, s: SectionGeometry, stageHeight: number): number {
  if (scrollY <= s.top) return s.top - scrollY;
  const pinnedEnd = s.top + Math.max(0, s.height - stageHeight);
  if (scrollY <= pinnedEnd) return 0;
  return pinnedEnd - scrollY;
}
