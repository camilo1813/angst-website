import { useEffect, useMemo, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import type { ScrollProgressState } from '../../lib/scrollProgress';
import type { StoryCoordinator, StorySnapshot } from '../../lib/story/coordinator';
import { subscribeSectionProgress } from '../../lib/story/progressSource';
import { computePersistentWorldState, type PersistentWorldState } from '../../lib/story/persistentWorld';
import { computeStableSignalAnchor, canvasDpr } from '../../lib/worldRuntime';
import PhysicalWorldScene from '../experience-02/PhysicalWorldScene';
import ObservationLayer, { ObservationProjector, createProjectionStore } from './ObservationLayer';

/**
 * The ONE persistent physical-world canvas (P3: the visible renderer in the public default mode).
 *
 * It renders the SAME PhysicalWorldScene (Life / Machine / Environment fields, grid, structural
 * points, signal anchor, bridge, connection) the legacy E02/E03 canvases rendered, from the SAME
 * maps, with ONE camera driven by the scene's own CameraRig. Every input comes from the story
 * coordinator: progress (through the one P2A progress source — the same emissions every other
 * consumer receives), mode (mobile / reduced motion / WebGL / tab visibility), segment and render
 * eligibility. No scroll controller, no layout reads of its own.
 */

const INITIAL: ScrollProgressState = { progress: 0, isNear: false, isScrolling: false };

export interface PersistentWorldReport {
  state: PersistentWorldState;
  signalAnchor: [number, number, number] | null;
  dpr: number;
  frameloop: 'always' | 'never' | 'demand';
  segment: string;
}

/** Mount ledger (QA): proves the world is built once and never rebuilt across E02 → E03. */
export interface WorldLedger { roots: number; canvasMounts: number; sceneMounts: number; contextsCreated: number; slotMoves: number }

/** Inside the Canvas: reports the live renderer/camera/scene, counts scene-subtree mounts, invalidates on demand. */
function WorldProbe({ stamp, ledger, onGl }: { stamp: unknown; ledger: WorldLedger; onGl: (gl: unknown, camera: unknown, scene: unknown) => void }) {
  const { gl, camera, scene, invalidate } = useThree();
  useEffect(() => { ledger.sceneMounts++; }, [ledger]);
  useEffect(() => { onGl(gl, camera, scene); }, [gl, camera, scene, onGl]);
  useEffect(() => { invalidate(); }, [stamp, invalidate]);
  return null;
}

export default function PersistentWorldCanvas({
  coordinator,
  mode,
  ledger,
  onReport,
  onGl,
}: {
  coordinator: StoryCoordinator;
  mode: 'persistent' | 'shadow';
  ledger: WorldLedger;
  onReport: (r: PersistentWorldReport) => void;
  onGl: (gl: unknown, camera: unknown, scene: unknown) => void;
}) {
  const [snap, setSnap] = useState<StorySnapshot | null>(() => coordinator.getSnapshot());
  const [e02, setE02] = useState<ScrollProgressState>(INITIAL);
  const [e03, setE03] = useState<ScrollProgressState>(INITIAL);
  const [e04, setE04] = useState<ScrollProgressState>(INITIAL);
  const projection = useMemo(() => createProjectionStore(), []);

  useEffect(() => { ledger.canvasMounts++; }, [ledger]);

  useEffect(() => {
    const offSnap = coordinator.subscribe(setSnap);
    const e02El = document.querySelector('[data-e02-section]');
    const e03El = document.querySelector('[data-e03-section]');
    const h02 = e02El ? subscribeSectionProgress('world-e02', 'e02', e02El, setE02) : null;
    const h03 = e03El ? subscribeSectionProgress('world-e03', 'e03', e03El, setE03) : null;
    // E04: the observation layer (information ABOUT the world) — only the visible persistent world draws it.
    const e04El = mode === 'persistent' ? document.querySelector('[data-e04-section]') : null;
    const h04 = e04El ? subscribeSectionProgress('world-e04', 'e04', e04El, setE04) : null;
    return () => { offSnap(); h02?.destroy(); h03?.destroy(); h04?.destroy(); };
  }, [coordinator, mode]);

  const isMobile = snap?.mode.isMobile ?? false;
  const [signalAnchor, setSignalAnchor] = useState<[number, number, number] | null>(null);
  const vw = snap?.viewport.innerWidth ?? 0;
  const vh = snap?.viewport.innerHeight ?? 0;
  const svh = snap?.viewport.svhPx ?? 0;
  useEffect(() => {
    // P4: deterministic anchor — a pure function of the viewport (canonical scrollY = 0 layout),
    // recomputed whenever the viewport or breakpoint changes, never dependent on the scroll position
    // or moment of mount. For a page mounted at the top it equals the P3 / legacy value exactly.
    const world = computeStableSignalAnchor(isMobile);
    if (world) setSignalAnchor((prev) => (prev && prev.every((v, i) => v === world[i]) ? prev : world));
  }, [isMobile, vw, vh, svh]);

  const state = useMemo(
    () => (snap ? computePersistentWorldState({ segment: snap.segment, isMobile, reducedMotion: snap.mode.reducedMotion, e02, e03 }) : null),
    [snap, isMobile, e02, e03],
  );
  const dpr = useMemo(() => canvasDpr(isMobile), [isMobile]);
  // Visible: the legacy rule (continuous while eligible — exact ambient-motion parity; paused when
  // the tab is hidden or the story region is off-screen). Shadow (QA): only on state change.
  const frameloop: 'always' | 'never' | 'demand' = mode === 'persistent' ? (snap?.renderEligible.world ? 'always' : 'never') : 'demand';
  const initialCamera = useMemo(() => state?.scene.cameraPosition ?? [0, 0, 10], [state === null]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (state && snap) onReport({ state, signalAnchor, dpr, frameloop, segment: snap.segment });
  }, [state, signalAnchor, dpr, frameloop, snap, onReport]);

  if (!state || !signalAnchor) return null;

  // E04 observation layer: active from the E03 → E04 handoff on (projection is written only on change).
  const observing = mode === 'persistent' && !!snap && (snap.segment === 'e04-handoff' || snap.segment === 'e04');

  return (
    <>
    <Canvas
      dpr={dpr}
      frameloop={frameloop}
      gl={{ alpha: true, antialias: true }}
      camera={{ position: initialCamera as [number, number, number], fov: state.fov, near: 0.1, far: 100 }}
      onCreated={() => { ledger.contextsCreated++; }}
    >
      <PhysicalWorldScene
        scene={state.scene}
        signalAnchor={signalAnchor}
        ambientAmplitude={state.ambientAmplitude}
        isMobile={state.isMobile}
        pointBudget={state.pointBudget}
      />
      <WorldProbe stamp={state} ledger={ledger} onGl={onGl} />
      <ObservationProjector active={observing} isMobile={state.isMobile} store={projection} />
    </Canvas>
    {mode === 'persistent' && (
      <ObservationLayer
        e04={e04}
        isMobile={state.isMobile}
        reducedMotion={snap?.mode.reducedMotion ?? false}
        live={!!snap?.renderEligible.e04}
        store={projection}
      />
    )}
    </>
  );
}
