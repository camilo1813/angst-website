// Physical-world RUNTIME helpers shared by every renderer of the one physical world:
// the legacy E02 canvas, the legacy E03 canvas and (P2B) the persistent world.
//
// These were previously written out inline in PhysicalWorldCanvas.tsx and
// Experience03Controller.tsx (identically). They were moved here verbatim so a third renderer
// cannot drift from the approved behaviour: same signal-anchor projection, same DPR cap, same
// ambient-motion rule, same point budgets.

import { getCameraProfile } from './sceneMaps';
import { projectScreenPointToWorld } from './signalAlignment';
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
    profile.fov,
    9,
  );
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
