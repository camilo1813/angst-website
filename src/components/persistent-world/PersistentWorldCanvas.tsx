import { useEffect, useMemo, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import type { ScrollProgressState } from '../../lib/scrollProgress';
import type { StoryCoordinator, StorySnapshot } from '../../lib/story/coordinator';
import { computePersistentWorldState, type PersistentWorldState } from '../../lib/story/persistentWorld';
import { computeSignalAnchor, canvasDpr } from '../../lib/worldRuntime';
import PhysicalWorldScene from '../experience-02/PhysicalWorldScene';

/**
 * P2B — ONE persistent physical-world canvas (shadow / QA only; never mounted in public mode).
 *
 * It renders the SAME PhysicalWorldScene (same Life/Machine/Environment fields, grid, structural
 * points, signal anchor, bridge and connection) the legacy E02/E03 canvases render, from the SAME
 * maps, with ONE camera driven by the scene's own CameraRig. Every input comes from the story
 * coordinator: progress streams (the same emissions the legacy consumers receive), mode
 * (mobile / reduced motion / WebGL / tab visibility), segment and render eligibility.
 */

const INITIAL: ScrollProgressState = { progress: 0, isNear: false, isScrolling: false };

export interface PersistentWorldReport {
  state: PersistentWorldState;
  signalAnchor: [number, number, number] | null;
  dpr: number;
  frameloop: 'always' | 'never' | 'demand';
  segment: string;
}

/** Invalidates on every state change when rendering on demand, and reports the live renderer for QA. */
function WorldProbe({ stamp, onGl }: { stamp: unknown; onGl: (gl: unknown, camera: unknown) => void }) {
  const { gl, camera, invalidate } = useThree();
  useEffect(() => { onGl(gl, camera); }, [gl, camera, onGl]);
  useEffect(() => { invalidate(); }, [stamp, invalidate]);
  return null;
}

export default function PersistentWorldCanvas({
  coordinator,
  mode,
  onReport,
  onGl,
}: {
  coordinator: StoryCoordinator;
  mode: 'shadow' | 'visible';
  onReport: (r: PersistentWorldReport) => void;
  onGl: (gl: unknown, camera: unknown) => void;
}) {
  const [snap, setSnap] = useState<StorySnapshot | null>(() => coordinator.getSnapshot());
  const [e02, setE02] = useState<ScrollProgressState>(INITIAL);
  const [e03, setE03] = useState<ScrollProgressState>(INITIAL);

  useEffect(() => {
    const offSnap = coordinator.subscribe(setSnap);
    const offE02 = coordinator.subscribeSection('e02', setE02);
    const offE03 = coordinator.subscribeSection('e03', setE03);
    return () => { offSnap(); offE02(); offE03(); };
  }, [coordinator]);

  const isMobile = snap?.mode.isMobile ?? false;
  const [signalAnchor, setSignalAnchor] = useState<[number, number, number] | null>(null);
  useEffect(() => {
    // Same projection, same element, same trigger (mount + mobile breakpoint change) as the legacy canvases.
    const world = computeSignalAnchor(isMobile);
    if (world) setSignalAnchor(world);
  }, [isMobile]);

  const state = useMemo(
    () => (snap ? computePersistentWorldState({ segment: snap.segment, isMobile, reducedMotion: snap.mode.reducedMotion, e02, e03 }) : null),
    [snap, isMobile, e02, e03],
  );
  const dpr = useMemo(() => canvasDpr(isMobile), [isMobile]);
  // Shadow: render only when the state changes (no continuous loop, nothing composited).
  // Visible QA: same rule as the legacy canvases (continuous while eligible, for ambient motion parity).
  const frameloop: 'always' | 'never' | 'demand' = mode === 'visible' ? (snap?.renderEligible.world ? 'always' : 'never') : 'demand';
  const initialCamera = useMemo(() => state?.scene.cameraPosition ?? [0, 0, 10], [state === null]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (state && snap) onReport({ state, signalAnchor, dpr, frameloop, segment: snap.segment });
  }, [state, signalAnchor, dpr, frameloop, snap, onReport]);

  if (!state || !signalAnchor) return null;

  return (
    <Canvas
      dpr={dpr}
      frameloop={frameloop}
      gl={{ alpha: true, antialias: true }}
      camera={{ position: initialCamera as [number, number, number], fov: state.fov, near: 0.1, far: 100 }}
    >
      <PhysicalWorldScene
        scene={state.scene}
        signalAnchor={signalAnchor}
        ambientAmplitude={state.ambientAmplitude}
        isMobile={state.isMobile}
        pointBudget={state.pointBudget}
      />
      <WorldProbe stamp={state} onGl={onGl} />
    </Canvas>
  );
}
