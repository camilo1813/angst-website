// Shared story coordinator — SHADOW COMPARATOR (P1).
//
// Cross-checks the coordinator against the values the EXISTING local E02/E03 logic has
// actually applied to the DOM (inline opacities and the fallback bucket attribute). Nothing
// is written to the page except, in explicit debug mode, invisible data-* attributes.
// No console output: results accumulate in `stats` / `mismatches` for QA to read.

import { computeSceneValues, copyProtectionStrength } from '../sceneMaps';
import { computeExperience03State, computeFallbackBucket } from '../experience03Maps';
import type { StoryCoordinator, StorySnapshot } from './coordinator';

/** Local controllers re-emit only when progress moves by > 0.0005 (scrollProgress.ts). */
const LOCAL_EMIT_THRESHOLD = 0.0005;
const EPS = 1e-4;

export interface ShadowMismatch { frame: number; scrollY: number; channel: string; local: number | string; shadow: string; }

function band(fn: (p: number) => number, p: number) {
  const vals = [fn(Math.max(0, p - LOCAL_EMIT_THRESHOLD)), fn(p), fn(Math.min(1, p + LOCAL_EMIT_THRESHOLD))];
  return [Math.min(...vals) - EPS, Math.max(...vals) + EPS] as const;
}

const inlineOpacity = (el: Element | null) => {
  if (!el) return null;
  const v = (el as HTMLElement).style.opacity;
  return v === '' ? null : parseFloat(v);
};

export function attachShadowComparator(coord: StoryCoordinator, opts: { debugAttributes: boolean }) {
  const stats = { enabled: true, comparisons: 0, channelsChecked: 0, mismatchCount: 0, maxAbsDiff: 0, lastFrame: 0 };
  const mismatches: ShadowMismatch[] = [];
  let timer: number | null = null;

  const q = (s: string) => document.querySelector(s);
  const record = (s: StorySnapshot, channel: string, local: number | string, lo: number, hi: number, value?: number) => {
    stats.channelsChecked++;
    if (typeof local === 'number') {
      const diff = local < lo ? lo - local : local > hi ? local - hi : 0;
      if (diff > 0) {
        stats.mismatchCount++;
        stats.maxAbsDiff = Math.max(stats.maxAbsDiff, diff);
        if (mismatches.length < 100) mismatches.push({ frame: s.frame, scrollY: s.viewport.scrollY, channel, local, shadow: `[${lo.toFixed(4)}, ${hi.toFixed(4)}]${value !== undefined ? ` @${value.toFixed(4)}` : ''}` });
      }
    }
  };

  const compare = () => {
    timer = null;
    const s = coord.getSnapshot();
    if (!s) return;
    stats.comparisons++;
    stats.lastFrame = s.frame;
    const mob = s.mode.isMobile;

    // ---- E02 hero echo + copy shield (local: Experience02PhysicalWorld.astro script)
    if (s.near.e02 || s.mode.reducedMotion) {
      const p = s.mode.reducedMotion ? 1 : s.progress.e02;
      const echo = q('[data-e02-hero-echo]');
      const ch: Array<[string, string, (v: ReturnType<typeof computeSceneValues>) => number]> = [
        ['e02.echo.eyebrow', '.eyebrow', (v) => v.heroEyebrowOpacity],
        ['e02.echo.life', '.line--life span', (v) => v.heroLifeOpacity],
        ['e02.echo.machines', '.line--machines span', (v) => v.heroMachinesOpacity],
        ['e02.echo.environments', '.line--environments span', (v) => v.heroEnvironmentsOpacity],
        ['e02.echo.conclusion', '.conclusion', (v) => v.heroConclusionOpacity],
      ];
      for (const [name, sel, pick] of ch) {
        const local = inlineOpacity(echo?.querySelector(sel) ?? null);
        if (local === null) continue;
        const [lo, hi] = band((pp) => pick(computeSceneValues(pp, mob)), p);
        record(s, name, local, lo, hi, p);
      }
      const shield = inlineOpacity(q('[data-e02-copy-shield]'));
      if (shield !== null) { const [lo, hi] = band(copyProtectionStrength, p); record(s, 'e02.copyShield', shield, lo, hi, p); }
    }

    // ---- E03 labels / statement / shield / fallback bucket (local: Experience03Overlay.astro script)
    if (s.near.e03) {
      const p = s.progress.e03;
      const ch: Array<[string, string, keyof ReturnType<typeof computeExperience03State>['labels']]> = [
        ['e03.orientation', '[data-e03-label="orientation"]', 'orientation'],
        ['e03.life', '[data-e03-label="life"]', 'life'],
        ['e03.machines', '[data-e03-label="machines"]', 'machines'],
        ['e03.environments', '[data-e03-label="environments"]', 'environments'],
        ['e03.statementSupporting', '[data-e03-label="statement-primary"]', 'statementPrimary'],
        ['e03.statementPayoff', '[data-e03-label="statement-final"]', 'statementFinal'],
        ['e03.mobileShield', '[data-e03-statement-shield]', 'mobileStatementShield'],
      ];
      for (const [name, sel, key] of ch) {
        const local = inlineOpacity(q(sel));
        if (local === null) continue;
        const [lo, hi] = band((pp) => computeExperience03State(pp, mob).labels[key] as number, p);
        record(s, name, local, lo, hi, p);
      }
      const fb = q('[data-e03-fallback]')?.getAttribute('data-e03-fallback-state');
      if (fb) {
        stats.channelsChecked++;
        const ok = [p - LOCAL_EMIT_THRESHOLD, p, p + LOCAL_EMIT_THRESHOLD].some((pp) => computeFallbackBucket(Math.min(1, Math.max(0, pp))) === fb);
        if (!ok) { stats.mismatchCount++; if (mismatches.length < 100) mismatches.push({ frame: s.frame, scrollY: s.viewport.scrollY, channel: 'e03.fallbackBucket', local: fb, shadow: computeFallbackBucket(p) }); }
      }
    }

    if (opts.debugAttributes) {
      const root = document.documentElement;
      root.setAttribute('data-story-segment', s.segment);
      root.setAttribute('data-story-label', s.semantic.label);
      root.setAttribute('data-story-shadow', stats.mismatchCount === 0 ? 'aligned' : `mismatch:${stats.mismatchCount}`);
    }
  };

  // Compare once the page is still (local controllers update within a frame; E03 CSS
  // transitions do not affect inline style values, which are what we read).
  const unsubscribe = coord.subscribe(() => {
    if (timer !== null) window.clearTimeout(timer);
    timer = window.setTimeout(compare, 120);
  });

  return {
    stats, mismatches,
    compareNow: compare,
    detach() { unsubscribe(); if (timer !== null) window.clearTimeout(timer); stats.enabled = false; },
  };
}
