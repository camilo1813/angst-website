// P3 — the persistent physical world: ONE React root, ONE R3F canvas, ONE WebGL context, ONE camera
// for E02 and E03. Lazily imported by StoryCoordinator.astro in 'persistent' (public default) and
// 'shadow' (QA) modes; never loaded in 'legacy' rollback mode.
//
// PLACEMENT ('persistent'). The world is composited exactly where the approved legacy canvas of the
// active section was: inside that section's own canvas slot (.e02-canvas-root / .e03-canvas-root,
// which the legacy islands still render, empty, in this mode). It therefore inherits the slot's size
// (100% × 100svh sticky stage), its paint layer (z 0, under copy shields and overlays), the sticky
// stage's sub-pixel snapping and pin/unpin travel, the E02 reduced-motion reveal (.rm-pending on the
// E02 slot) and the no-WebGL rule (.no-webgl hides the slots). Only one DOM node moves; the canvas,
// context, camera and scene are never rebuilt.
//
// Across the E02→E03 HANDOFF, while both stages are displaced by ≥ 1 px, the host sits in a fixed
// 100svh layer on the same paint layer, so the one world stays put instead of riding a moving stage.
// P4 (continuous geometry, StoryGeometry.astro): that interval now exists only on viewports > 700 px,
// for the 40svh + 100px in which the E02 signal-hint echo scrolls out (≤ 700 px it is zero and this
// layer is never used). With the P3 geometry (?story-geometry=legacy) it spans the full legacy
// boundary as before.

import { createRoot } from 'react-dom/client';
import type { StoryCoordinator, StorySnapshot } from '../../lib/story/coordinator';
import { handoffDifferences } from '../../lib/story/persistentWorld';
import { stageTop } from '../../lib/story/geometry';
import PersistentWorldCanvas, { type PersistentWorldReport, type WorldLedger } from './PersistentWorldCanvas';

export type WorldSlot = 'e02' | 'boundary' | 'e03';

/** Which slot hosts the one world, from coordinator geometry only (no layout reads). */
export function worldSlotFor(s: StorySnapshot): WorldSlot {
  const h = s.viewport.svhPx;
  const t02 = stageTop(s.viewport.scrollY, s.sections.e02, h);
  const t03 = stageTop(s.viewport.scrollY, s.sections.e03, h);
  // P4: once E03's stage is pinned it owns the world, even while E02's (now empty) stage is still in
  // its last sub-pixel of unpin travel — with the continuous geometry both can hold at the same scroll
  // position. (With the P3 geometry t03 ≤ 0 only after E02 has fully left, so nothing changes there.)
  if (t03 <= 0) return 'e03';
  if (t02 > -1) return 'e02';
  if (t03 < 1) return 'e03';
  return 'boundary';
}

/**
 * Resolves once React has actually COMMITTED hydration of each slot element. (Astro's
 * 'astro:hydrate' event fires when hydrateRoot() is called, before React's concurrent hydration
 * commits; appending into the slot earlier would be a hydration mismatch.) React marks a hydrated
 * DOM node with an internal `__reactFiber$…` key.
 */
function whenHydrated(slotSelectors: string[]): Promise<void> {
  const committed = () => slotSelectors.every((sel) => {
    const el = document.querySelector(sel);
    return !!el && Object.keys(el).some((k) => k.startsWith('__reactFiber$'));
  });
  return new Promise((resolve) => {
    const check = () => (committed() ? resolve() : requestAnimationFrame(check));
    check();
  });
}

export function mountPersistentWorld(coordinator: StoryCoordinator, mode: 'persistent' | 'shadow') {
  const host = document.createElement('div');
  host.setAttribute('data-persistent-world', mode);
  host.setAttribute('aria-hidden', 'true');

  const ledger: WorldLedger = { roots: 0, canvasMounts: 0, sceneMounts: 0, contextsCreated: 0, slotMoves: 0 };
  let boundaryLayer: HTMLDivElement | null = null;
  let offPlacement: (() => void) | null = null;
  let currentSlot: WorldSlot | 'shadow' | null = null;

  const slotElement = (slot: WorldSlot): Element | null => {
    if (slot === 'e02') return document.querySelector('.e02-canvas-root');
    if (slot === 'e03') return document.querySelector('.e03-canvas-root');
    if (!boundaryLayer) {
      boundaryLayer = document.createElement('div');
      boundaryLayer.setAttribute('data-persistent-world-boundary', '');
      boundaryLayer.setAttribute('aria-hidden', 'true');
      boundaryLayer.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100svh;z-index:0;pointer-events:none';
      document.body.appendChild(boundaryLayer);
    }
    return boundaryLayer;
  };

  if (mode === 'shadow') {
    // QA only: sized like the stages, never painted, renders on demand.
    host.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100svh;z-index:0;pointer-events:none;visibility:hidden';
    document.body.appendChild(host);
    currentSlot = 'shadow';
  } else {
    host.style.cssText = 'position:absolute;inset:0;pointer-events:none';
  }

  const place = () => {
    const snap = coordinator.getSnapshot();
    if (!snap) return;
    const slot = worldSlotFor(snap);
    if (slot === currentSlot && host.isConnected) return;
    const el = slotElement(slot);
    if (!el) return;
    el.appendChild(host); // a DOM move: same canvas element, same WebGL context, same React root
    if (currentSlot !== null) ledger.slotMoves++;
    currentSlot = slot;
  };

  let last: PersistentWorldReport | null = null;
  let gl: { info?: { render?: { frame: number } }; domElement?: HTMLCanvasElement; getContext?: () => unknown } | null = null;
  let camera: { uuid?: string; position: { toArray(): number[] }; quaternion: { toArray(): number[] }; fov: number; aspect: number; near: number; far: number; projectionMatrix: { elements: number[] } } | null = null;
  let scene: unknown = null;
  let root: ReturnType<typeof createRoot> | null = null;

  const render = () => {
    root = createRoot(host);
    ledger.roots++;
    root.render(
      <PersistentWorldCanvas
        coordinator={coordinator}
        mode={mode}
        ledger={ledger}
        onReport={(r) => { last = r; }}
        onGl={(g, c, s) => { gl = g as typeof gl; camera = c as typeof camera; scene = s; }}
      />,
    );
  };

  if (mode === 'shadow') render();
  else {
    // Wait for the E02/E03 islands to hydrate so their (empty) slot elements are final, then place
    // the host and render. Before that nothing is shown — exactly like the legacy canvases, which
    // only appear after hydration.
    whenHydrated(['.e02-canvas-root', '.e03-canvas-root']).then(() => {
      place();
      offPlacement = coordinator.subscribe(place) as unknown as () => void;
      render();
    });
  }

  const api = {
    mode,
    host,
    ledger,
    slot: () => currentSlot,
    /** Live objects for identity checks (QA): compare with === across scroll positions. */
    identity: () => ({ root, host, canvas: gl?.domElement ?? null, context: gl?.getContext?.() ?? null, camera, scene }),
    /** Last computed world state + live camera / renderer facts (QA). */
    getState() {
      if (!last) return null;
      const canvas = gl?.domElement ?? null;
      return {
        ...last,
        slot: currentSlot,
        camera: camera ? {
          position: camera.position.toArray(), quaternion: camera.quaternion.toArray(),
          fov: camera.fov, aspect: camera.aspect, near: camera.near, far: camera.far,
          projection: Array.from(camera.projectionMatrix.elements),
        } : null,
        canvas: canvas ? { cssWidth: canvas.clientWidth, cssHeight: canvas.clientHeight, width: canvas.width, height: canvas.height } : null,
        renders: gl?.info?.render?.frame ?? null,
      };
    },
    /** E02 p=1 vs E03 p=0: every scene value that differs (expected: none). */
    handoff: { desktop: handoffDifferences(false), mobile: handoffDifferences(true) },
    unmount() { offPlacement?.(); root?.unmount(); host.remove(); boundaryLayer?.remove(); },
  };
  return api;
}
