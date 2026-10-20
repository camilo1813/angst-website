// Shared story coordinator — PROGRESS SOURCE (P2A).
//
// The one place E02/E03 consumers obtain normalized scroll progress. It hands every consumer
// a ScrollProgressState stream with the legacy contract ({ progress, isNear, isScrolling },
// an initial reading immediately, then changes), from one of two sources:
//
//   coordinator (default) — the shared StoryCoordinator: one measurement, one scroll listener,
//                           one rAF publish per change, fanned out to all four consumers.
//   legacy (rollback)     — scrollProgress.createScrollProgress per consumer, exactly as frozen
//                           at p1-story-coordinator-approved.
//
// TEMPORARY MIGRATION INFRASTRUCTURE — not product behaviour. Selection (first match wins):
//   1. PUBLIC_STORY_COORDINATOR=off (build env)      → legacy (no coordinator exists at all)
//   2. URL query  ?story-progress=legacy|coordinator → that source (QA, no rebuild)
//   3. window.__ANGST_STORY_PROGRESS__ = 'legacy'|'coordinator' set before page scripts (QA init script)
//   4. PUBLIC_STORY_PROGRESS_SOURCE=legacy|coordinator (build env; default 'coordinator')
// A page always uses ONE source for all consumers (resolved once per page load).

import { createScrollProgress, type ScrollProgressListener, type ScrollProgressState } from '../scrollProgress';
import { getStoryCoordinator, type StorySectionId } from './coordinator';

export type ProgressSource = 'coordinator' | 'legacy';

export interface ProgressConsumerRecord {
  name: string;
  section: StorySectionId;
  /** Source actually in use ('legacy-fallback' = coordinator requested but could not start). */
  source: ProgressSource | 'legacy-fallback';
  active: boolean;
  deliveries: number;
  last: ScrollProgressState | null;
}

const isSource = (v: unknown): v is ProgressSource => v === 'coordinator' || v === 'legacy';

let resolved: ProgressSource | null = null;
export function resolveProgressSource(): ProgressSource {
  if (resolved) return resolved;
  let r: ProgressSource = String(import.meta.env.PUBLIC_STORY_PROGRESS_SOURCE ?? 'coordinator') === 'legacy' ? 'legacy' : 'coordinator';
  const w = window as unknown as Record<string, unknown>;
  if (isSource(w.__ANGST_STORY_PROGRESS__)) r = w.__ANGST_STORY_PROGRESS__;
  try {
    const q = new URLSearchParams(window.location.search).get('story-progress');
    if (isSource(q)) r = q;
  } catch { /* ignore */ }
  if (String(import.meta.env.PUBLIC_STORY_COORDINATOR ?? 'on') === 'off') r = 'legacy';
  resolved = r;
  return r;
}

const REGISTRY_KEY = '__angstStoryProgressConsumers';
/** All consumers registered on this page (QA / comparator). */
export function progressConsumers(): Map<string, ProgressConsumerRecord> {
  const w = window as unknown as Record<string, Map<string, ProgressConsumerRecord> | undefined>;
  let m = w[REGISTRY_KEY];
  if (!m) {
    m = new Map();
    Object.defineProperty(window, REGISTRY_KEY, { value: m, configurable: true, enumerable: false });
  }
  return m;
}

/**
 * Subscribe one consumer to a section's normalized progress. Drop-in replacement for
 * createScrollProgress(sectionEl, onChange) — same callback contract, same destroy().
 */
export function subscribeSectionProgress(
  name: string,
  section: StorySectionId,
  sectionEl: Element,
  onChange: ScrollProgressListener,
): { destroy: () => void; source: ProgressConsumerRecord['source'] } {
  const record: ProgressConsumerRecord = { name, section, source: resolveProgressSource(), active: true, deliveries: 0, last: null };
  progressConsumers().set(name, record);
  const forward: ScrollProgressListener = (state) => {
    record.deliveries++;
    record.last = state;
    onChange(state);
  };

  if (record.source === 'coordinator') {
    try {
      const unsubscribe = getStoryCoordinator().subscribeSection(section, forward);
      return { source: record.source, destroy: () => { unsubscribe(); record.active = false; } };
    } catch (err) {
      // Never leave a section without progress: fall back to the legacy controller.
      (window as unknown as Record<string, unknown>).__angstStoryError = String(err);
      record.source = 'legacy-fallback';
    }
  }
  const handle = createScrollProgress(sectionEl, forward);
  return { source: record.source, destroy: () => { handle.destroy(); record.active = false; } };
}
