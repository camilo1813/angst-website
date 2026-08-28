import { useMemo } from 'react';
import * as THREE from 'three';
import { createSeededRandom } from '../../lib/seededRandom';

const ENVELOPE: [number, number, number] = [1.1, 1.5, 0.9];
const AXIS_HEIGHT = 2.3;
const SURFACE_COLOR = '#22262a';
const EDGE_COLOR = '#565c62';
const SIGNAL_POINT_COLOR = '#dfe3e6';

interface MachineFieldProps {
  visibility: number;
  axisOpacity: number;
  pointCount: number;
  center: [number, number, number];
  /** Compresses the assembly's vertical extent for mobile's steeper camera angle. */
  heightScale?: number;
}

// All geometry below is built in the assembly's LOCAL space (its own
// origin at floor level); the enclosing <group> translates it to world
// position, so nothing here should add ORIGIN itself.

function buildCornerPosts() {
  const [w, h, d] = ENVELOPE;
  const corners: Array<[number, number]> = [
    [-w / 2, -d / 2],
    [w / 2, -d / 2],
    [w / 2, d / 2],
    [-w / 2, d / 2],
  ];
  const points: number[] = [];
  // Open envelope: free-floating vertical posts only — no connecting
  // top/bottom perimeter, so it never reads as a closed box. Two posts
  // are deliberately shortened so the structure reads as incomplete.
  const heights = [h, h * 0.62, h, h * 0.8];
  corners.forEach(([x, z], i) => {
    points.push(x, 0, z, x, heights[i], z);
  });
  return new Float32Array(points);
}

function buildAxisAndCrossMembers() {
  const points: number[] = [];
  // One vertical mechanical axis, taller than the envelope itself.
  points.push(0, 0, 0, 0, AXIS_HEIGHT, 0);

  // Short structural cross-members at different heights, alternating
  // orientation — reads as flanges/brackets, not a symmetric cage.
  const members: Array<[number, number, number]> = [
    [0.5, 0.55, 0],
    [0, 1.1, 0.42],
    [0.4, 1.75, 0.3],
  ];
  members.forEach(([dx, y, dz]) => {
    points.push(-dx * 0.4, y, -dz * 0.4, dx, y, dz);
  });

  return new Float32Array(points);
}

function buildSignalPoints(count: number) {
  const rand = createSeededRandom(9042);
  const positions = new Float32Array(count * 3);
  const [w, h, d] = ENVELOPE;

  for (let i = 0; i < count; i++) {
    // Bias points along the axis and cross-members rather than a shell.
    const alongAxis = rand() > 0.4;
    let x: number;
    let y: number;
    let z: number;
    if (alongAxis) {
      x = (rand() - 0.5) * 0.3;
      y = rand() * AXIS_HEIGHT;
      z = (rand() - 0.5) * 0.3;
    } else {
      x = (rand() - 0.5) * w * 1.3;
      y = rand() * h;
      z = (rand() - 0.5) * d * 1.3;
    }
    positions[i * 3] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;
  }
  return positions;
}

export default function MachineField({
  visibility,
  axisOpacity,
  pointCount,
  center,
  heightScale = 1,
}: MachineFieldProps) {
  const { postsGeometry, axisGeometry, planeGeometry, signalPositions } = useMemo(() => {
    const postsGeometry = new THREE.BufferGeometry();
    postsGeometry.setAttribute('position', new THREE.BufferAttribute(buildCornerPosts(), 3));

    const axisGeometry = new THREE.BufferGeometry();
    axisGeometry.setAttribute('position', new THREE.BufferAttribute(buildAxisAndCrossMembers(), 3));

    // One internal plane — a single partial wall, not a closed volume.
    const planeGeometry = new THREE.PlaneGeometry(ENVELOPE[2], ENVELOPE[1] * 0.85);

    const signalPositions = buildSignalPoints(pointCount);

    return { postsGeometry, axisGeometry, planeGeometry, signalPositions };
  }, [pointCount]);

  const axisAlpha = Math.max(axisOpacity, visibility * 0.45);

  return (
    <group
      position={center}
      scale={[1, heightScale, 1]}
      visible={axisAlpha > 0.01 || visibility > 0.01}
    >
      <lineSegments geometry={postsGeometry} visible={visibility > 0.01}>
        <lineBasicMaterial
          color={EDGE_COLOR}
          transparent
          opacity={visibility * 0.4}
          depthWrite={false}
        />
      </lineSegments>
      <lineSegments geometry={axisGeometry}>
        <lineBasicMaterial
          color={EDGE_COLOR}
          transparent
          opacity={axisAlpha}
          depthWrite={false}
        />
      </lineSegments>
      <mesh
        geometry={planeGeometry}
        position={[-ENVELOPE[0] / 2, ENVELOPE[1] * 0.42, 0]}
        rotation={[0, Math.PI / 2, 0]}
        visible={visibility > 0.01}
      >
        <meshBasicMaterial
          color={SURFACE_COLOR}
          transparent
          opacity={visibility * 0.14}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
      <points visible={visibility > 0.01}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[signalPositions, 3]} />
        </bufferGeometry>
        <pointsMaterial
          color={SIGNAL_POINT_COLOR}
          size={0.035}
          sizeAttenuation
          transparent
          opacity={visibility * 0.65}
          depthWrite={false}
        />
      </points>
    </group>
  );
}
