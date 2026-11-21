/**
 * Hero controller. The cinematic opening itself is CSS (plays once on first load and
 * ends in the final state). This file only:
 *  - draws the decorative convergence geometry (Life · Machines · Environments → the answer)
 *    and reveals it at 2.8s;
 *  - schedules the quiet 1px panel scan (~every 8s while visible, paused on hidden tab);
 *  - on a later return, gives a small re-activation instead of replaying the intro.
 */
import { motionReady, onTabVisibility, prefersReducedMotion, replayClass, watch } from '../lib/motion';

const hero = document.querySelector<HTMLElement>('[data-hero]');
const field = hero?.querySelector<HTMLElement>('.console__field');
const copy = hero?.querySelector<HTMLElement>('.hero__copy');
const svg = hero?.querySelector<SVGSVGElement>('.hx-conv');

if (hero && field && copy && svg && motionReady()) {
  // ---- convergence geometry (layout positions only: transforms never affect offsets) ----
  const pos = (el: HTMLElement) => {
    let x = 0, y = 0, n: HTMLElement | null = el;
    while (n && n !== copy) {
      x += n.offsetLeft;
      y += n.offsetTop;
      n = n.offsetParent as HTMLElement | null;
    }
    return { x, y, w: el.offsetWidth, h: el.offsetHeight };
  };
  const draw = () => {
    const words = ['life', 'mach', 'env'].map((k) => hero.querySelector<HTMLElement>(`.hx-w--${k}`)!);
    const answer = hero.querySelector<HTMLElement>('.hx-muted')!;
    const fs = parseFloat(getComputedStyle(words[0]).fontSize);
    const spine = -Math.max(10, Math.min(18, fs * 0.16));
    const nodes = words.map((w) => {
      const p = pos(w);
      return { x: p.x, y: Math.round(p.y + p.h * 0.97) };
    });
    const a = pos(answer);
    const end = { x: a.x - 4, y: Math.round(a.y + Math.min(a.h, fs) * 0.55) };
    const d = (x: number) => x.toFixed(1);
    let out = '';
    for (const n of nodes) {
      out += `<path pathLength="1" d="M${d(n.x)} ${n.y}H${d(spine)}"/><circle cx="${d(n.x)}" cy="${n.y}" r="2.5"/>`;
    }
    out += `<path class="spine" pathLength="1" d="M${d(spine)} ${nodes[0].y}V${end.y}H${d(end.x)}"/>`;
    svg.innerHTML = out;
  };
  draw();
  let rz = 0;
  window.addEventListener('resize', () => {
    clearTimeout(rz);
    rz = window.setTimeout(draw, 150);
  });
  const CONVERGE_AT = 2800;
  window.setTimeout(() => hero.classList.add('is-converge'), Math.max(0, CONVERGE_AT - performance.now()));

  // ---- quiet scan + return behaviour ----
  const EVERY = 8000;
  let timer = 0;
  let inView = false;
  let visits = 0;
  let tabShown = !document.hidden;

  const halt = () => {
    clearTimeout(timer);
    field.classList.remove('is-scan');
  };
  const schedule = (first = EVERY) => {
    clearTimeout(timer);
    if (!inView || !tabShown || prefersReducedMotion()) return;
    timer = window.setTimeout(() => {
      replayClass(field, 'is-scan');
      schedule();
    }, first);
  };

  watch(hero, {
    enter: 0.35,
    leave: 0.1,
    onEnter: () => {
      inView = true;
      visits += 1;
      if (visits > 1 && !prefersReducedMotion()) {
        // Returning visitor: no full intro — a small re-activation and an immediate scan.
        replayClass(hero, 'is-return');
        schedule(250);
      } else schedule();
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
