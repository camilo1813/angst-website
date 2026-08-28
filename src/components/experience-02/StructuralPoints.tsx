import { useMemo } from 'react';
import * as THREE from 'three';
import { createSeededRandom } from '../../lib/seededRandom';

const POINT_COLOR = '#c7cbce';

interface StructuralPointsProps {
  opacity: number;
  count: number;
  isMobile: boolean;
}

/**
 * STATE 4 — "depth appears": a generic scattered point cloud, not yet
 * regionally distinguished. It is what makes the scene feel three-
 * dimensional just before the Life/Machine/Environment fields become
 * individually legible in STATE 5.
 *
 * z stays safely in front of each device's camera minimum (desktop 9.2,
 * mobile 4.6) — points behind the camera simply don't render, but this
 * keeps the depth distribution meaningful rather than half-wasted.
 */
function buildPositions(count: number, isMobile: boolean) {
  const rand = createSeededRandom(2718);
  const positions = new Float32Array(count * 3);
  const xHalf = isMobile ? 4 : 9;
  const zMax = isMobile ? 4 : 8;

  for (let i = 0; i < count; i++) {
    positions[i * 3] = -xHalf + rand() * xHalf * 2;
    positions[i * 3 + 1] = 0.05 + rand() * (isMobile ? 3 : 4.2);
    positions[i * 3 + 2] = -1 + rand() * (zMax + 1);
  }
  return positions;
}

export default function StructuralPoints({ opacity, count, isMobile }: StructuralPointsProps) {
  const positions = useMemo(() => buildPositions(count, isMobile), [count, isMobile]);

  return (
    <points visible={opacity > 0.01}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        color={POINT_COLOR}
        size={0.028}
        sizeAttenuation
        transparent
        opacity={opacity * 0.45}
        depthWrite={false}
      />
    </points>
  );
}
