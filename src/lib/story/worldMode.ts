// Persistent-world mode flag (P2B). TEMPORARY MIGRATION INFRASTRUCTURE — not product behaviour.
//
//   off     (default) — legacy E02/E03 canvases only. Nothing of the persistent world is loaded.
//   shadow            — legacy canvases visible and authoritative; the persistent world is mounted
//                       hidden (visibility:hidden) and renders ON DEMAND only, for state comparison.
//   visible           — QA ONLY: persistent world shown in place of the legacy canvases (legacy
//                       canvases stay mounted but hidden) for frame comparison. Never a default.
//
// Selection (first match wins):
//   1. PUBLIC_STORY_COORDINATOR=off (build env)        → off
//   2. URL query  ?story-world=off|shadow|visible
//   3. window.__ANGST_STORY_WORLD__ = 'off'|'shadow'|'visible' (set before page scripts)
//   4. PUBLIC_STORY_WORLD=off|shadow (build env; 'visible' is refused at build level)  default 'off'
// No WebGL → always off (the static fallback stays authoritative).

export type WorldMode = 'off' | 'shadow' | 'visible';
const isMode = (v: unknown): v is WorldMode => v === 'off' || v === 'shadow' || v === 'visible';

export function resolveWorldMode(): WorldMode {
  if (String(import.meta.env.PUBLIC_STORY_COORDINATOR ?? 'on') === 'off') return 'off';
  if (document.documentElement.classList.contains('no-webgl')) return 'off';
  try {
    const q = new URLSearchParams(window.location.search).get('story-world');
    if (isMode(q)) return q;
  } catch { /* ignore */ }
  const w = (window as unknown as Record<string, unknown>).__ANGST_STORY_WORLD__;
  if (isMode(w)) return w;
  return String(import.meta.env.PUBLIC_STORY_WORLD ?? 'off') === 'shadow' ? 'shadow' : 'off';
}
