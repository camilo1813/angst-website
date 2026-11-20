// Shared story coordinator — REVERSE COMPARATOR (P2A).
//
// Authority model: the coordinator is the source of truth for E02/E03 progress. This verifies,
// after the page goes still, that what is actually RENDERED matches the coordinator:
//
//   dom      — inline opacities written by the E02/E03 overlay scripts and the E03 fallback
//              bucket attribute, against the approved maps evaluated at coordinator progress;
//   consumer — the last ScrollProgressState each registered consumer received (overlay scripts
//              AND the R3F canvases), against coordinator progress / nearness;
//   geometry — the legacy live formula (computeSectionProgress on the element) against the
//              coordinator's cached-geometry progress (guards against stale measurements).
//
// Every channel that is EXPECTED in the current state is counted; an expected channel that
// cannot be read is a failure (missingChannels), so `channelsChecked = 0` can never pass.
// Works identically in rollback (legacy) mode, where it becomes the P1 shadow check.
// Nothing is written to the page except, in explicit debug mode, invisible data-* attributes.
// No console output: results accumulate in `stats` / `mismatches` for QA to read.

import { computeSceneValues, copyProtectionStrength } from '../sceneMaps';
import { computeExperience03State, computeFallbackBucket } from '../experience03Maps';
import { computeExperience04State } from '../experience04Maps';
import { computeSectionProgress, PROGRESS_EMIT_THRESHOLD } from '../scrollProgress';
import type { StoryCoordinator, StorySnapshot, StorySectionId } from './coordinator';
import { progressConsumers, resolveProgressSource } from './progressSource';
import { resolveWorldMode } from './worldMode';

const EPS = 1e-4;
const GEOMETRY_EPS = 1e-6;
/** Consumers hydrate after page scripts (client:load); only demand them once the page has loaded. */
const CONSUMER_GRACE_MS = 1000;
/**
 * The comparator judges SETTLED state. A failing comparison is re-run (same snapshot, page still)
 * up to SETTLE_RETRIES times, SETTLE_RETRY_MS apart, before anything is recorded — e.g. the legacy
 * rollback path's IntersectionObserver can start a paused controller late after a long jump.
 * A failing pass interrupted by a newer publish is not dropped silently: it is counted in
 * `stats.unsettled` (expected to be 0 for the coordinator source).
 */
const SETTLE_RETRIES = 5;
const SETTLE_RETRY_MS = 100;

export interface ShadowMismatch { frame: number; scrollY: number; channel: string; local: number | string; shadow: string; }

function band(fn: (p: number) => number, p: number) {
  const vals = [fn(Math.max(0, p - PROGRESS_EMIT_THRESHOLD)), fn(p), fn(Math.min(1, p + PROGRESS_EMIT_THRESHOLD))];
  return [Math.min(...vals) - EPS, Math.max(...vals) + EPS] as const;
}

const inlineOpacity = (el: Element | null) => {
  if (!el) return null;
  const v = (el as HTMLElement).style.opacity;
  return v === '' ? null : parseFloat(v);
};

export function attachShadowComparator(coord: StoryCoordinator, opts: { debugAttributes: boolean }) {
  const stats = {
    enabled: true,
    authority: resolveProgressSource(),
    comparisons: 0,
    expectedChannels: 0,
    channelsChecked: 0,
    missingChannels: 0,
    mismatchCount: 0,
    /** Failing passes superseded by a newer publish before they settled (not counted as mismatches). */
    unsettled: 0,
    maxAbsDiff: 0,
    lastFrame: 0,
    /** true only when something was actually checked and nothing was missing or wrong. */
    ok: false,
  };
  const mismatches: ShadowMismatch[] = [];
  const missing: Array<{ frame: number; channel: string }> = [];
  let timer: number | null = null;
  let pendingFailure = false;
  let loadedAt: number | null = document.readyState === 'complete' ? Date.now() : null;
  if (loadedAt === null) window.addEventListener('load', () => { loadedAt = Date.now(); }, { once: true });

  const q = (s: string) => document.querySelector(s);
  // One comparison pass accumulates here; it is committed to `stats` only once settled.
  let run = { expected: 0, checked: 0, missing: [] as string[], fails: [] as Array<{ channel: string; local: number | string; shadow: string; diff: number }> };
  const fail = (_s: StorySnapshot, channel: string, local: number | string, shadow: string, diff = 0) => {
    run.fails.push({ channel, local, shadow, diff });
  };
  const expect = (_s: StorySnapshot, channel: string, local: number | string | null | undefined, check: (v: number | string) => void) => {
    run.expected++;
    if (local === null || local === undefined) { run.missing.push(channel); return; }
    run.checked++;
    check(local);
  };
  const inBand = (s: StorySnapshot, channel: string, lo: number, hi: number, at: number) => (v: number | string) => {
    const n = Number(v);
    const diff = n < lo ? lo - n : n > hi ? n - hi : 0;
    if (diff > 0) fail(s, channel, n, `[${lo.toFixed(4)}, ${hi.toFixed(4)}] @${at.toFixed(4)}`, diff);
  };

  const compare = (attempt = 0) => {
    timer = null;
    const s = coord.getSnapshot();
    if (!s) return;
    // A newer publish is pending (the page moved since this snapshot): wait for it.
    if (s.viewport.scrollY !== window.scrollY || s.viewport.innerHeight !== window.innerHeight) return;
    run = { expected: 0, checked: 0, missing: [], fails: [] };
    const mob = s.mode.isMobile;
    const rm = s.mode.reducedMotion;
    const consumersDue = loadedAt !== null && Date.now() - loadedAt >= CONSUMER_GRACE_MS;

    // ---- geometry: legacy live formula vs coordinator cached geometry
    (['e02', 'e03', 'e04'] as StorySectionId[]).forEach((id) => {
      if (!s.near[id]) return;
      const el = q(`[data-${id}-section]`);
      const live = el ? computeSectionProgress(el) : null;
      expect(s, `${id}.liveGeometry`, live, (v) => {
        const d = Math.abs(Number(v) - s.progress[id]);
        if (d > GEOMETRY_EPS) fail(s, `${id}.liveGeometry`, Number(v), s.progress[id].toFixed(6), d);
      });
    });

    // ---- consumers: what each E02/E03 consumer last received
    if (consumersDue) {
      const registry = progressConsumers();
      // Expected consumers depend on the renderer mode (P3): legacy canvases in 'legacy'/'shadow',
      // the one persistent world's two progress streams in 'persistent'/'shadow'. The E02 overlay and
      // legacy E02 canvas do not subscribe under reduced motion (they present p = 1).
      const wm = resolveWorldMode();
      const legacyCanvases = wm !== 'persistent';
      const persistentWorld = wm !== 'legacy'; // strict: a world that failed to mount is a missing channel, not a skip
      const expected: Array<[string, StorySectionId]> = [
        ...(rm ? [] : ([['e02-overlay', 'e02']] as Array<[string, StorySectionId]>)),
        ...(!rm && legacyCanvases ? ([['e02-canvas', 'e02']] as Array<[string, StorySectionId]>) : []),
        ['e03-overlay', 'e03'],
        ...(legacyCanvases ? ([['e03-canvas', 'e03']] as Array<[string, StorySectionId]>) : []),
        ...(persistentWorld ? ([['world-e02', 'e02'], ['world-e03', 'e03']] as Array<[string, StorySectionId]>) : []),
        // E04: its copy/fallback script always; the observation layer only with the VISIBLE persistent world.
        ...(s.sections.e04 ? ([['e04-overlay', 'e04']] as Array<[string, StorySectionId]>) : []),
        ...(s.sections.e04 && wm === 'persistent' ? ([['world-e04', 'e04']] as Array<[string, StorySectionId]>) : []),
      ];
      for (const [name, id] of expected) {
        const rec = registry.get(name);
        const last = rec && rec.active ? rec.last : null;
        expect(s, `consumer.${name}.near`, last ? String(last.isNear) : null, (v) => {
          if (v !== String(s.near[id])) fail(s, `consumer.${name}.near`, v, String(s.near[id]));
        });
        if (s.near[id]) {
          const [lo, hi] = [s.progress[id] - PROGRESS_EMIT_THRESHOLD - 1e-9, s.progress[id] + PROGRESS_EMIT_THRESHOLD + 1e-9];
          expect(s, `consumer.${name}.progress`, last ? last.progress : null, inBand(s, `consumer.${name}.progress`, lo, hi, s.progress[id]));
        }
      }
    }

    // ---- E02 hero echo + copy shield (Experience02PhysicalWorld.astro script)
    if (s.near.e02 || rm) {
      const p = rm ? 1 : s.progress.e02;
      const echo = q('[data-e02-hero-echo]');
      const ch: Array<[string, string, (v: ReturnType<typeof computeSceneValues>) => number]> = [
        ['e02.echo.eyebrow', '.eyebrow', (v) => v.heroEyebrowOpacity],
        ['e02.echo.life', '.line--life span', (v) => v.heroLifeOpacity],
        ['e02.echo.machines', '.line--machines span', (v) => v.heroMachinesOpacity],
        ['e02.echo.environments', '.line--environments span', (v) => v.heroEnvironmentsOpacity],
        ['e02.echo.conclusion', '.conclusion', (v) => v.heroConclusionOpacity],
      ];
      for (const [name, sel, pick] of ch) {
        const [lo, hi] = band((pp) => pick(computeSceneValues(pp, mob)), p);
        expect(s, name, inlineOpacity(echo?.querySelector(sel) ?? null), inBand(s, name, lo, hi, p));
      }
      const [lo, hi] = band(copyProtectionStrength, p);
      expect(s, 'e02.copyShield', inlineOpacity(q('[data-e02-copy-shield]')), inBand(s, 'e02.copyShield', lo, hi, p));
    }

    // ---- E03 labels / statement / shield / fallback bucket (Experience03Overlay.astro script)
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
        const [lo, hi] = band((pp) => computeExperience03State(pp, mob).labels[key] as number, p);
        expect(s, name, inlineOpacity(q(sel)), inBand(s, name, lo, hi, p));
      }
      expect(s, 'e03.fallbackBucket', q('[data-e03-fallback]')?.getAttribute('data-e03-fallback-state'), (fb) => {
        const ok = [p - PROGRESS_EMIT_THRESHOLD, p, p + PROGRESS_EMIT_THRESHOLD].some((pp) => computeFallbackBucket(Math.min(1, Math.max(0, pp))) === fb);
        if (!ok) fail(s, 'e03.fallbackBucket', fb, computeFallbackBucket(p));
      });
    }

    // ---- E04 copy lines (Experience04Observation.astro script)
    if (s.near.e04) {
      const p = s.progress.e04;
      for (const [name, sel, key] of [['e04.line1', '[data-e04-line="1"]', 'line1'], ['e04.line2', '[data-e04-line="2"]', 'line2']] as Array<[string, string, 'line1' | 'line2']>) {
        const [lo, hi] = band((pp) => computeExperience04State(pp, mob, rm).copy[key], p);
        expect(s, name, inlineOpacity(q(sel)), inBand(s, name, lo, hi, p));
      }
    }

    if ((run.fails.length || run.missing.length) && attempt < SETTLE_RETRIES) {
      pendingFailure = true;
      timer = window.setTimeout(() => compare(attempt + 1), SETTLE_RETRY_MS);
      return;
    }
    pendingFailure = false;
    // Commit the settled result.
    stats.comparisons++;
    stats.lastFrame = s.frame;
    stats.expectedChannels += run.expected;
    stats.channelsChecked += run.checked;
    stats.missingChannels += run.missing.length;
    for (const channel of run.missing) if (missing.length < 100) missing.push({ frame: s.frame, channel });
    for (const f of run.fails) {
      stats.mismatchCount++;
      stats.maxAbsDiff = Math.max(stats.maxAbsDiff, f.diff);
      if (mismatches.length < 100) mismatches.push({ frame: s.frame, scrollY: s.viewport.scrollY, channel: f.channel, local: f.local, shadow: f.shadow });
    }
    stats.ok = stats.comparisons > 0 && stats.channelsChecked > 0 && stats.missingChannels === 0 && stats.mismatchCount === 0;

    if (opts.debugAttributes) {
      const root = document.documentElement;
      root.setAttribute('data-story-segment', s.segment);
      root.setAttribute('data-story-label', s.semantic.label);
      root.setAttribute('data-story-shadow', stats.ok ? 'aligned' : stats.channelsChecked === 0 ? 'unchecked' : `mismatch:${stats.mismatchCount};missing:${stats.missingChannels}`);
    }
  };

  // Compare once the page is still (consumers update within a frame; E03 CSS transitions do
  // not affect inline style values, which are what we read).
  const unsubscribe = coord.subscribe(() => {
    if (timer !== null) window.clearTimeout(timer);
    if (pendingFailure) { stats.unsettled++; pendingFailure = false; }
    timer = window.setTimeout(() => compare(0), 120);
  });

  return {
    stats, mismatches, missing,
    compareNow: () => compare(SETTLE_RETRIES),
    detach() { unsubscribe(); if (timer !== null) window.clearTimeout(timer); stats.enabled = false; },
  };
}
