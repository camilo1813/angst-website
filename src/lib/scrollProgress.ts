// Single source of truth for Experience 02's scroll state.
// Every scene property (grid opacity, point visibility, camera position,
// hero-echo fade, etc.) is a pure function of the normalized progress
// value produced here — nothing else drives the scene.

export interface ScrollProgressState {
  /** 0 → 1 across the pinned scroll range of the section. */
  progress: number;
  /** Whether the section's sticky viewport is anywhere near the screen. */
  isNear: boolean;
  /** Whether the user has scrolled within the last ~500ms. */
  isScrolling: boolean;
}

export type ScrollProgressListener = (state: ScrollProgressState) => void;

export interface ScrollProgressHandle {
  destroy: () => void;
  getState: () => ScrollProgressState;
}

/** Scroll-idle window: `isScrolling` stays true until this long after the last scroll event. */
export const SCROLL_IDLE_MS = 500;
/** Minimum progress change that is re-emitted to consumers (filters sub-pixel jitter). */
export const PROGRESS_EMIT_THRESHOLD = 0.0005;
/** A section counts as "near" while within this fraction of the viewport height above/below it. */
export const NEAR_MARGIN_FRACTION = 0.25;

/**
 * Computes normalized scroll progress (0 → 1) through a tall section's
 * pinned range: 0 when the section's top has just reached the viewport
 * top, 1 when its bottom has just reached the viewport bottom.
 */
export function computeSectionProgress(sectionEl: Element): number {
  const rect = sectionEl.getBoundingClientRect();
  const viewportHeight = window.innerHeight;
  const scrollableRange = rect.height - viewportHeight;
  if (scrollableRange <= 0) return 1;
  const raw = -rect.top / scrollableRange;
  return Math.min(1, Math.max(0, raw));
}

export function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Subscribes to scroll-driven progress for a section. Internally pauses
 * its rAF loop whenever the section is far from the viewport or the tab
 * is hidden, so nothing is computed for an off-screen/backgrounded scene.
 */
export function createScrollProgress(
  sectionEl: Element,
  onChange: ScrollProgressListener,
): ScrollProgressHandle {
  let isNear = false;
  let tabVisible = document.visibilityState === 'visible';
  let rafId: number | null = null;
  let lastProgress = -1;
  let scrollIdleTimer: number | null = null;
  let isScrolling = false;

  const state: ScrollProgressState = { progress: 0, isNear: false, isScrolling: false };

  const notify = () => {
    onChange({ ...state });
  };

  const tick = () => {
    if (!isNear || !tabVisible) {
      rafId = null;
      return;
    }
    const progress = computeSectionProgress(sectionEl);
    if (Math.abs(progress - lastProgress) > PROGRESS_EMIT_THRESHOLD) {
      lastProgress = progress;
      state.progress = progress;
      notify();
    }
    rafId = requestAnimationFrame(tick);
  };

  const ensureLoop = () => {
    if (rafId === null && isNear && tabVisible) {
      rafId = requestAnimationFrame(tick);
    }
  };

  const observer = new IntersectionObserver(
    (entries) => {
      const entry = entries[0];
      isNear = !!entry && entry.isIntersecting;
      state.isNear = isNear;
      notify();
      ensureLoop();
    },
    { rootMargin: `${NEAR_MARGIN_FRACTION * 100}% 0px ${NEAR_MARGIN_FRACTION * 100}% 0px`, threshold: 0 },
  );
  observer.observe(sectionEl);

  const onVisibilityChange = () => {
    tabVisible = document.visibilityState === 'visible';
    ensureLoop();
  };
  document.addEventListener('visibilitychange', onVisibilityChange);

  const onScroll = () => {
    isScrolling = true;
    state.isScrolling = true;
    if (scrollIdleTimer !== null) window.clearTimeout(scrollIdleTimer);
    scrollIdleTimer = window.setTimeout(() => {
      isScrolling = false;
      state.isScrolling = false;
      notify();
    }, SCROLL_IDLE_MS);
  };
  window.addEventListener('scroll', onScroll, { passive: true });

  // Establish an initial reading immediately (covers reload mid-scroll).
  isNear = true;
  state.progress = computeSectionProgress(sectionEl);
  lastProgress = state.progress;
  notify();
  isNear = false;

  return {
    destroy: () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      if (scrollIdleTimer !== null) window.clearTimeout(scrollIdleTimer);
      observer.disconnect();
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('scroll', onScroll);
    },
    getState: () => ({ ...state }),
  };
}

/** Clamped linear remap, matching the spec's `map(progress, ...)` calls. */
export function mapRange(
  value: number,
  inMin: number,
  inMax: number,
  outMin: number,
  outMax: number,
): number {
  if (inMin === inMax) return value >= inMax ? outMax : outMin;
  const t = (value - inMin) / (inMax - inMin);
  const clamped = Math.min(1, Math.max(0, t));
  return outMin + clamped * (outMax - outMin);
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
