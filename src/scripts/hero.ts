/**
 * Hero controller. The observation sequence itself is pure CSS (it plays once on load and
 * ends in the final state). This only schedules the quiet 1px scan: once every 8s while the
 * hero is meaningfully visible and the tab is shown.
 */
import { motionReady, onTabVisibility, prefersReducedMotion, replayClass, watch } from '../lib/motion';

const hero = document.querySelector<HTMLElement>('[data-hero]');
const field = hero?.querySelector<HTMLElement>('.console__field');

if (hero && field && motionReady()) {
  const EVERY = 8000;
  let timer = 0;
  let inView = false;
  let tabShown = !document.hidden;

  const halt = () => {
    clearTimeout(timer);
    field.classList.remove('is-scan');
  };
  const schedule = () => {
    clearTimeout(timer);
    if (!inView || !tabShown || prefersReducedMotion()) return;
    timer = window.setTimeout(() => {
      replayClass(field, 'is-scan');
      schedule();
    }, EVERY);
  };

  watch(hero, {
    enter: 0.35,
    leave: 0.1,
    onEnter: () => {
      inView = true;
      schedule();
    },
    onLeave: () => {
      inView = false;
      halt();
    },
  });
  onTabVisibility((shown) => {
    tabShown = shown;
    if (shown) schedule();
    else halt();
  });
}
