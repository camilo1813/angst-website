import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { createSeededRandom } from '../../lib/seededRandom';

const LIFE_COLOR = '#e9ebee';

interface LifeFieldProps {
  visibility: number;
  count: number;
  ambientAmplitude: number;
  center: [number, number, number];
  /** Compresses the silhouette's vertical extent — mobile's much steeper
   * camera angle needs a shorter figure to keep it from clipping above/
   * below the frame. 1 = full desktop height. */
  heightScale?: number;
}

// Weak anthropomorphic silhouette, expressed only as point density —
// no face, limbs, or skeleton. Control points are (heightT, radius):
// wide stance at the base, narrowing through the waist, a slight
// shoulder expansion, then narrowing again into a smaller head region.
const SILHOUETTE: Array<[number, number]> = [
  [0, 0.6],
  [0.28, 0.64],
  [0.36, 0.36],
  [0.6, 0.33],
  [0.72, 0.56],
  [0.85, 0.34],
  [1, 0.26],
];

function silhouetteRadius(t: number): number {
  for (let i = 0; i < SILHOUETTE.length - 1; i++) {
    const [t0, r0] = SILHOUETTE[i];
    const [t1, r1] = SILHOUETTE[i + 1];
    if (t >= t0 && t <= t1) {
      const local = (t - t0) / (t1 - t0);
      return r0 + (r1 - r0) * local;
    }
  }
  return SILHOUETTE[SILHOUETTE.length - 1][1];
}

function buildPositions(count: number, heightScale: number) {
  const rand = createSeededRandom(4201);
  const positions = new Float32Array(count * 3);
  const basePositions = new Float32Array(count * 3);

  for (let i = 0; i < count; i++) {
    // ~28% of points bias toward the head/shoulder band for a slightly
    // denser upper region, without forcing every point through it.
    const headBiased = rand() < 0.28;
    const heightT = headBiased ? 0.72 + rand() * 0.28 : rand();

    const y = (heightT * 2.3 + 0.05) * heightScale;
    const radius = silhouetteRadius(heightT) * Math.sqrt(rand());
    const angle = rand() * Math.PI * 2;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius * 0.8;

    positions[i * 3] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;
    basePositions[i * 3] = x;
    basePositions[i * 3 + 1] = y;
    basePositions[i * 3 + 2] = z;
  }

  return { positions, basePositions };
}

export default function LifeField({
  visibility,
  count,
  ambientAmplitude,
  center,
  heightScale = 1,
}: LifeFieldProps) {
  const pointsRef = useRef<THREE.Points>(null);
  const { positions, basePositions } = useMemo(
    () => buildPositions(count, heightScale),
    [count, heightScale],
  );

  useFrame(({ clock }) => {
    if (!pointsRef.current || ambientAmplitude < 0.01) return;
    const t = clock.getElapsedTime();
    const attr = pointsRef.current.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < count; i++) {
      const phase = i * 0.37;
      attr.array[i * 3 + 1] =
        basePositions[i * 3 + 1] + Math.sin(t * 0.6 + phase) * 0.02 * ambientAmplitude;
    }
    attr.needsUpdate = true;
  });

  return (
    <points ref={pointsRef} position={center} visible={visibility > 0.01}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        color={LIFE_COLOR}
        size={0.045}
        sizeAttenuation
        transparent
        opacity={visibility * 0.8}
        depthWrite={false}
      />
    </points>
  );
}
