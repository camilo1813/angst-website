// Physical-world RUNTIME helpers shared by every renderer of the one physical world:
// the legacy E02 canvas, the legacy E03 canvas and (P2B) the persistent world.
//
// These were previously written out inline in PhysicalWorldCanvas.tsx and
// Experience03Controller.tsx (identically). They were moved here verbatim so a third renderer
// cannot drift from the approved behaviour: same signal-anchor projection, same DPR cap, same
// ambient-motion rule, same point budgets.

import { getCameraProfile } from './sceneMaps';
import { projectScreenPointToWorld } from './signalAlignment';
import { framingFov } from './framing';
import { DESKTOP_BUDGET, MOBILE_BUDGET, type PointBudget } from './pointBudgets';

export { MOBILE_BREAKPOINT_QUERY } from './breakpoints';

/**
 * World-space position of the Three.js signal anchor: the CSS signal-hint node
 * ([data-e02-signal-anchor]) as currently laid out on screen, projected through the E02 START
 * camera at depth 9.
 *
 * NOTE (frozen behaviour, recorded in the persistent-world parity contract): the result
 * depends on where the anchor element is on screen at call time, i.e. on the scroll position
 * when a renderer mounts or crosses the mobile breakpoint. In every approved E02/E03 state this
 * leaves the blue signal off-screen. That is intentional until E04; do not "fix" it here.
 */
export function computeSignalAnchor(isMobile: boolean): [number, number, number] | null {
  const anchorEl = document.querySelector('[data-e02-signal-anchor]');
  if (!anchorEl) return null;
  const rect = anchorEl.getBoundingClientRect();
  const profile = getCameraProfile(isMobile);
  return projectScreenPointToWorld(
    rect.left + rect.width / 2,
    rect.top + rect.height / 2,
    window.innerWidth,
    window.innerHeight,
    profile.start,
    profile.lookAtStart,
    framingFov(profile.start, profile.lookAtStart, window.innerWidth, window.innerHeight, isMobile, profile.fov),
    9,
  );
}

/**
 * P4 — DETERMINISTIC signal/reference anchor for the persistent world.
 *
 * Same projection as computeSignalAnchor (E02 START camera, depth 9), but the screen point is the
 * anchor node's position in the page's CANONICAL layout — where it is laid out when the document is
 * at scrollY = 0 — instead of wherever it happens to be on screen at mount time. It is therefore a
 * pure function of the viewport (width, height, breakpoint) and no longer depends on the scroll
 * position at mount (reload / restored scroll / deep link) or on mount timing.
 *
 *  - Rendered node (> 700 px): x from its live rect (x never depends on scroll); y = the E02
 *    section's document top + the node's offset inside the (sticky) E02 stage. At scrollY = 0 the
 *    stage sits unstuck at the section top, so this reproduces exactly the value the legacy
 *    function returns for a page mounted at the top (every approved golden state).
 *  - Unrendered node (≤ 700 px: the signal hint is display:none, its rect is all zeros): the legacy
 *    function projected screen point (0, 0) — the viewport's top-left corner. That value is kept,
 *    now explicitly, so mobile output is unchanged; it is already scroll-independent.
 *
 * In every approved E02/E03 state the resulting anchor stays off-screen (no blue). It defines the
 * spatial reference only; it adds no E04 semantics.
 */
export function computeStableSignalAnchor(isMobile: boolean): [number, number, number] | null {
  const anchorEl = document.querySelector('[data-e02-signal-anchor]');
  const stageEl = document.querySelector('.e02-stage');
  const sectionEl = document.querySelector('[data-e02-section]');
  if (!anchorEl || !stageEl || !sectionEl) return null;
  const rect = anchorEl.getBoundingClientRect();
  let x = 0;
  let y = 0;
  if (rect.width > 0 || rect.height > 0) {
    const stageTopInViewport = stageEl.getBoundingClientRect().top;
    const sectionTopInDocument = sectionEl.getBoundingClientRect().top + window.scrollY;
    x = rect.left + rect.width / 2;
    y = sectionTopInDocument + (rect.top - stageTopInViewport) + rect.height / 2;
  }
  const profile = getCameraProfile(isMobile);
  // Same responsive framing as the rendered E02-start camera (lib/framing.ts; = profile.fov at 16:9).
  const fov = framingFov(profile.start, profile.lookAtStart, window.innerWidth, window.innerHeight, isMobile, profile.fov);
  return projectScreenPointToWorld(x, y, window.innerWidth, window.innerHeight, profile.start, profile.lookAtStart, fov, 9);
}

/** Device-pixel-ratio cap for world canvases. */
export function canvasDpr(isMobile: boolean): number {
  if (typeof window === 'undefined') return 1;
  const cap = isMobile ? 1.25 : 1.5;
  return Math.min(window.devicePixelRatio || 1, cap);
}

/** Ambient point motion: none under reduced motion; full while scrolling, 15 % at rest. */
export function ambientAmplitude(settleAmbient: number, reducedMotion: boolean, isScrolling: boolean): number {
  return reducedMotion ? 0 : settleAmbient * (isScrolling ? 1 : 0.15);
}

export function pointBudgetFor(isMobile: boolean): PointBudget {
  return isMobile ? MOBILE_BUDGET : DESKTOP_BUDGET;
}
