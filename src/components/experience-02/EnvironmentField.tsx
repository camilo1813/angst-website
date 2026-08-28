import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { createSeededRandom } from '../../lib/seededRandom';

const DUST_COLOR = '#9aa2a8';
const BOUNDARY_COLOR = '#3a4046';

export interface EnvironmentRegion {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  zMin: number;
  zMax: number;
}

interface EnvironmentFieldProps {
  visibility: number;
  count: number;
  ambientAmplitude: number;
  region: EnvironmentRegion;
}

function buildDust(count: number, region: EnvironmentRegion) {
  const rand = createSeededRandom(6410);
  const positions = new Float32Array(count * 3);
  const basePositions = new Float32Array(count * 3);
  const { xMin, xMax, yMin, yMax, zMin, zMax } = region;

  for (let i = 0; i < count; i++) {
    // Depth-weighted density: bias toward nearer z so the field visibly
    // thins with distance, independent of the fog's opacity fade.
    const zT = Math.pow(rand(), 1.35);
    const x = xMin + rand() * (xMax - xMin);
    const y = yMin + rand() * (yMax - yMin);
    const z = zMin + zT * (zMax - zMin);
    positions[i * 3] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;
    basePositions[i * 3] = x;
    basePositions[i * 3 + 1] = y;
    basePositions[i * 3 + 2] = z;
  }
  return { positions, basePositions };
}

function buildBoundary(region: EnvironmentRegion) {
  const { xMin, xMax, zMin, zMax } = region;
  // An incomplete perimeter — three sides only, deliberately left open
  // rather than closed into a full rectangle/zone outline.
  const points = [
    xMin, 0.02, zMin,
    xMax, 0.02, zMin,
    xMax, 0.02, zMax,
    xMin, 0.02, zMax,
  ];
  return new Float32Array(points);
}

export default function EnvironmentField({
  visibility,
  count,
  ambientAmplitude,
  region,
}: EnvironmentFieldProps) {
  const pointsRef = useRef<THREE.Points>(null);
  const { positions, basePositions } = useMemo(() => buildDust(count, region), [count, region]);
  const boundaryPositions = useMemo(() => buildBoundary(region), [region]);

  useFrame(({ clock }) => {
    if (!pointsRef.current || ambientAmplitude < 0.01) return;
    const t = clock.getElapsedTime();
    const attr = pointsRef.current.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < count; i++) {
      const phase = i * 0.21;
      attr.array[i * 3] = basePositions[i * 3] + Math.sin(t * 0.25 + phase) * 0.06 * ambientAmplitude;
      attr.array[i * 3 + 1] =
        basePositions[i * 3 + 1] + Math.cos(t * 0.2 + phase) * 0.04 * ambientAmplitude;
    }
    attr.needsUpdate = true;
  });

  return (
    <group visible={visibility > 0.01}>
      <points ref={pointsRef}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        </bufferGeometry>
        <pointsMaterial
          color={DUST_COLOR}
          size={0.03}
          sizeAttenuation
          transparent
          opacity={visibility * 0.5}
          depthWrite={false}
        />
      </points>
      <line>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[boundaryPositions, 3]} />
        </bufferGeometry>
        <lineBasicMaterial
          color={BOUNDARY_COLOR}
          transparent
          opacity={visibility * 0.13}
          depthWrite={false}
        />
      </line>
    </group>
  );
}
