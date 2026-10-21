// Physical-world RENDERER MODE (P3). Exactly one renderer owns the visible physical world.
//
//   persistent (DEFAULT, public) — ONE persistent R3F canvas renders E02 and E03 (1 WebGL context).
//                                  The legacy E02/E03 islands render only their empty root slots.
//   legacy     (rollback)        — the original E02 and E03 canvases, exactly as at P2B (2 contexts).
//                                  Nothing of the persistent world is mounted.
//   shadow     (QA only)         — legacy canvases visible and authoritative + a hidden persistent
//                                  world rendering on demand for state comparison (3 contexts).
//
// Resolution (first match wins; unknown values are ignored, never guessed):
//   1. WebGL unavailable (frozen inline probe set html.no-webgl) → legacy  (static fallback stays authoritative;
//                                                                          no renderer creates a context)
//   2. PUBLIC_STORY_COORDINATOR=off (build env)                  → legacy  (no coordinator, no persistent world)
//   3. URL query   ?story-world=persistent|legacy|shadow
//   4. window.__ANGST_STORY_WORLD__ = 'persistent'|'legacy'|'shadow' (set before page scripts)
//   5. PUBLIC_STORY_WORLD=persistent|legacy (build env; 'shadow' is refused at build level so a public
//      build can never ship a debug renderer by default)
//   6. default                                                    → persistent
// The mode is resolved once per page load and cached; every consumer sees the same answer.

export type WorldMode = 'persistent' | 'legacy' | 'shadow';
const isMode = (v: unknown): v is WorldMode => v === 'persistent' || v === 'legacy' || v === 'shadow';

let resolved: WorldMode | null = null;

export function resolveWorldMode(): WorldMode {
  if (resolved) return resolved;
  resolved = compute();
  return resolved;
}

function compute(): WorldMode {
  if (typeof window === 'undefined') return 'legacy'; // SSR: legacy islands render their (identical) empty root markup
  if (document.documentElement.classList.contains('no-webgl')) return 'legacy';
  if (String(import.meta.env.PUBLIC_STORY_COORDINATOR ?? 'on') === 'off') return 'legacy';
  try {
    const q = new URLSearchParams(window.location.search).get('story-world');
    if (isMode(q)) return q;
  } catch { /* ignore */ }
  const w = (window as unknown as Record<string, unknown>).__ANGST_STORY_WORLD__;
  if (isMode(w)) return w;
  const env = String(import.meta.env.PUBLIC_STORY_WORLD ?? 'persistent');
  return env === 'legacy' ? 'legacy' : 'persistent';
}

/** True when the legacy E02/E03 islands must render their own WebGL canvases (legacy and shadow modes). */
export function legacyWorldCanvasesEnabled(): boolean {
  return resolveWorldMode() !== 'persistent';
}
