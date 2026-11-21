/**
 * ANGST shared motion helper — deliberately small.
 * Sections keep their own controllers; CSS performs the visual transitions via state classes.
 */

const RM = '(prefers-reduced-motion: reduce)';

/** True when the visitor prefers reduced motion. */
export const prefersReducedMotion = (): boolean => matchMedia(RM).matches;

/** True when the page opted into motion (set before first paint in BaseLayout). */
export const motionReady = (): boolean => document.documentElement.classList.contains('motion-ready');

export interface WatchOptions {
  /** Share of the element (or of the viewport, for tall elements) that must be visible to enter. */
  enter?: number;
  /** Below this share the element counts as having left (hysteresis: leave < enter). */
  leave?: number;
  /** Disconnect after the first enter. */
  once?: boolean;
  onEnter: () => void;
  onLeave?: () => void;
}

const STEPS = Array.from({ length: 21 }, (_, i) => i / 20);

/**
 * Observe meaningful visibility with enter/leave hysteresis, so tiny scrolls
 * around a boundary never re-trigger. Returns a disconnect function.
 */
export function watch(el: Element, o: WatchOptions): () => void {
  const enter = o.enter ?? 0.45;
  const leave = o.leave ?? 0.1;
  let inside = false;
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        // Normalise for elements taller than the viewport.
        const h = Math.min(e.boundingClientRect.height, window.innerHeight) || 1;
        const r = e.intersectionRect.height / h;
        if (!inside && r >= enter) {
          inside = true;
          o.onEnter();
          if (o.once) io.disconnect();
        } else if (inside && r < leave) {
          inside = false;
          o.onLeave?.();
        }
      }
    },
    { threshold: STEPS },
  );
  io.observe(el);
  return () => io.disconnect();
}

/** Call back with false when the tab is hidden and true when it is shown again. */
export function onTabVisibility(cb: (visible: boolean) => void): () => void {
  const h = () => cb(!document.hidden);
  document.addEventListener('visibilitychange', h);
  return () => document.removeEventListener('visibilitychange', h);
}

/** Restart a CSS animation driven by a state class (remove, reflow, add). */
export function replayClass(el: Element, cls: string): void {
  el.classList.remove(cls);
  void (el as HTMLElement).offsetWidth;
  el.classList.add(cls);
}
