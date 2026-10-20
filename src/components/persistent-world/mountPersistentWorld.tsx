// P2B — lazily loaded (dynamic import) ONLY when the world mode is 'shadow' or 'visible'.
// In the default public mode this module, React root and WebGL context never exist.
import { createRoot } from 'react-dom/client';
import type { StoryCoordinator } from '../../lib/story/coordinator';
import { handoffDifferences, worldPhaseFor } from '../../lib/story/persistentWorld';
import PersistentWorldCanvas, { type PersistentWorldReport } from './PersistentWorldCanvas';

const LEGACY_CANVAS_HIDE = '.e02-canvas-root canvas, .e03-canvas-root canvas { visibility: hidden !important; }';

export function mountPersistentWorld(coordinator: StoryCoordinator, mode: 'shadow' | 'visible') {
  const host = document.createElement('div');
  host.setAttribute('data-persistent-world', mode);
  host.setAttribute('aria-hidden', 'true');
  // Shadow: sized exactly like the legacy sticky stages (100% × 100svh), so on real mobile
  // browsers it keeps the same small-viewport behaviour instead of tracking the dynamic toolbar
  // height; never painted (visibility:hidden). Visible-QA re-styles it below.
  host.style.cssText = [
    'position:fixed', 'top:0', 'left:0', 'width:100%', 'height:100svh', 'z-index:0', 'pointer-events:none',
    mode === 'shadow' ? 'visibility:hidden' : '',
  ].filter(Boolean).join(';');
  document.body.appendChild(host);

  let offStage: (() => void) | null = null;
  if (mode === 'visible') {
    const style = document.createElement('style');
    style.setAttribute('data-persistent-world-qa', '');
    style.textContent = LEGACY_CANVAS_HIDE;
    document.head.appendChild(style);
    // QA frame comparison only: mount the world INSIDE the active phase's legacy sticky stage, as
    // the stage's last z-index-0 layer (above the hidden legacy canvas root, under the copy shield
    // and overlays). It is then composited exactly where — and with exactly the same sub-pixel
    // snapping as — the legacy canvas, including the unpin travel at section ends. Moving the host
    // between stages keeps the same React root, canvas and WebGL context (no rebuild).
    host.style.cssText = 'position:absolute;inset:0;z-index:0;pointer-events:none';
    const follow = () => {
      const snap = coordinator.getSnapshot();
      if (!snap) return;
      const stage = document.querySelector(worldPhaseFor(snap.segment) === 'e02' ? '.e02-stage' : '.e03-stage');
      if (stage && host.parentElement !== stage) stage.appendChild(host);
    };
    follow();
    offStage = coordinator.subscribe(follow) as unknown as () => void;
  }

  let last: PersistentWorldReport | null = null;
  let gl: { info?: { render?: { frame: number; calls: number } }; domElement?: HTMLCanvasElement } | null = null;
  let camera: { position: { toArray(): number[] }; quaternion: { toArray(): number[] }; fov: number; aspect: number; near: number; far: number; projectionMatrix: { elements: number[] } } | null = null;

  const api = {
    mode,
    host,
    /** Last computed world state + live camera / renderer facts (QA). */
    getState() {
      if (!last) return null;
      const canvas = gl?.domElement ?? null;
      return {
        ...last,
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
    unmount() { offStage?.(); root.unmount(); host.remove(); document.querySelector('style[data-persistent-world-qa]')?.remove(); },
  };

  const root = createRoot(host);
  root.render(
    <PersistentWorldCanvas
      coordinator={coordinator}
      mode={mode}
      onReport={(r) => { last = r; }}
      onGl={(g, c) => { gl = g as typeof gl; camera = c as typeof camera; }}
    />,
  );
  return api;
}
