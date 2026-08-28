import { useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { SceneValues } from '../../lib/sceneMaps';
import { lerp } from '../../lib/scrollProgress';
import SpatialGrid from './SpatialGrid';
import StructuralPoints from './StructuralPoints';
import LifeField from './LifeField';
import MachineField from './MachineField';
import EnvironmentField, { type EnvironmentRegion } from './EnvironmentField';

const VOID_COLOR = '#050607';
const SIGNAL_COLOR = '#8bcbff';
const CONNECTION_COLOR = '#4a5460';
const BRIDGE_COLOR = '#8f959a';

// Desktop: Life starts right-of-centre (out of the headline's screen
// region) and migrates left into the space the typography vacates once
// the hero has dropped below ~50% strength (lifeHandoffT, STATE 6).
// NOTE ON Z RANGES: every z value below must stay safely IN FRONT of its
// camera profile's closest approach (desktop 9.2, mobile 5.2 — see
// sceneMaps.ts). A point sitting behind the camera just doesn't render,
// but a LINE with one end in front and one behind gets catastrophically
// stretched by the perspective divide — that was the real cause of a
// "long diagonal debug line" dominating the frame, not segment length.
const DESKTOP_LIFE_EARLY: [number, number, number] = [1.3, 0, 3.4];
const DESKTOP_LIFE_FINAL: [number, number, number] = [-2.2, 0, 3.2];
const DESKTOP_MACHINE_CENTER: [number, number, number] = [1.8, 0, 4.4];
const DESKTOP_ENVIRONMENT_REGION: EnvironmentRegion = {
  xMin: -1.5,
  xMax: 8.5,
  yMin: 0.1,
  yMax: 3.4,
  zMin: 1,
  zMax: 8,
};

// Mobile: no handoff (the stacked mobile hero doesn't collide with the
// world the same way) — fixed upper-left Life, lower-right Machine,
// Environment distributed between/behind both, all within the narrower
// mobile frustum and the tighter mobile camera-depth budget.
const MOBILE_LIFE_CENTER: [number, number, number] = [1.07, 0, 3.6];
const MOBILE_MACHINE_CENTER: [number, number, number] = [1.35, 0, 4];
const MOBILE_ENVIRONMENT_REGION: EnvironmentRegion = {
  xMin: -1.8,
  xMax: 4.2,
  yMin: 0.05,
  yMax: 3,
  zMin: 1,
  zMax: 4,
};

interface PhysicalWorldSceneProps {
  scene: SceneValues;
  signalAnchor: [number, number, number];
  ambientAmplitude: number;
  isMobile: boolean;
  pointBudget: { life: number; machine: number; environment: number; structural: number; bridge: number };
}

function CameraRig({
  position,
  lookAt,
}: {
  position: [number, number, number];
  lookAt: [number, number, number];
}) {
  const { camera } = useThree();
  useFrame(() => {
    camera.position.set(position[0], position[1], position[2]);
    camera.lookAt(lookAt[0], lookAt[1], lookAt[2]);
  });
  return null;
}

function SignalAnchor({
  anchor,
  boost,
}: {
  anchor: [number, number, number];
  boost: number;
}) {
  const { primaryPositions, secondaryPositions, linePositions } = useMemo(() => {
    const secondary: [number, number, number] = [
      anchor[0] + 1.1,
      anchor[1] + 0.65,
      anchor[2] - 0.6,
    ];
    return {
      primaryPositions: new Float32Array(anchor),
      secondaryPositions: new Float32Array(secondary),
      linePositions: new Float32Array([...anchor, ...secondary]),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anchor[0], anchor[1], anchor[2]]);

  // Matches Experience 01's approved resting opacities (0.55 / 0.18 / 0.12),
  // with only a very small boost as the signal "awakens" (STATE 1).
  const primaryOpacity = 0.55 + boost * 0.12;
  const secondaryOpacity = 0.18 + boost * 0.1;
  const lineOpacity = 0.12 + boost * 0.08;

  return (
    <group>
      <points>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[primaryPositions, 3]} />
        </bufferGeometry>
        <pointsMaterial
          color={SIGNAL_COLOR}
          size={0.05}
          sizeAttenuation
          transparent
          opacity={primaryOpacity}
          depthWrite={false}
        />
      </points>
      <points>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[secondaryPositions, 3]} />
        </bufferGeometry>
        <pointsMaterial
          color={SIGNAL_COLOR}
          size={0.035}
          sizeAttenuation
          transparent
          opacity={secondaryOpacity}
          depthWrite={false}
        />
      </points>
      <line>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[linePositions, 3]} />
        </bufferGeometry>
        <lineBasicMaterial
          color={SIGNAL_COLOR}
          transparent
          opacity={lineOpacity}
          depthWrite={false}
        />
      </line>
    </group>
  );
}

// A single short connecting trace near the Machine/Environment boundary —
// deliberately NOT a continuous edge spanning Life→Machine (that reads as
// a graph "event" connection, which this experience must not suggest yet).
// The Life↔Machine relationship is instead carried by the scattered
// CentralBridge points below, not a literal line.
function FieldConnections({
  opacity,
  machineCenter,
  environmentAnchor,
}: {
  opacity: number;
  machineCenter: [number, number, number];
  environmentAnchor: [number, number, number];
}) {
  const positions = useMemo(
    () => new Float32Array([...machineCenter, ...environmentAnchor]),
    [machineCenter, environmentAnchor],
  );

  return (
    <lineSegments visible={opacity > 0.01}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <lineBasicMaterial
        color={CONNECTION_COLOR}
        transparent
        opacity={opacity}
        depthWrite={false}
      />
    </lineSegments>
  );
}

/** Sparse points between Life and Machine — one shared field, not two islands. */
function CentralBridge({
  opacity,
  count,
  lifeCenter,
  machineCenter,
}: {
  opacity: number;
  count: number;
  lifeCenter: [number, number, number];
  machineCenter: [number, number, number];
}) {
  const positions = useMemo(() => {
    // Deterministic scatter along the segment between the two centres,
    // with a little perpendicular jitter — a bridge, not a straight line.
    const arr = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const t = i / (count - 1);
      const jitterSeed = Math.sin(i * 12.9898) * 43758.5453;
      const jitter = jitterSeed - Math.floor(jitterSeed);
      const x = lerp(lifeCenter[0], machineCenter[0], t) + (jitter - 0.5) * 1.6;
      const y = 0.1 + jitter * 0.9;
      const z = lerp(lifeCenter[2], machineCenter[2], t) + (jitter - 0.5) * 1.2;
      arr[i * 3] = x;
      arr[i * 3 + 1] = y;
      arr[i * 3 + 2] = z;
    }
    return arr;
  }, [count, lifeCenter, machineCenter]);

  return (
    <points visible={opacity > 0.01}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        color={BRIDGE_COLOR}
        size={0.03}
        sizeAttenuation
        transparent
        opacity={opacity * 0.4}
        depthWrite={false}
      />
    </points>
  );
}

export default function PhysicalWorldScene({
  scene,
  signalAnchor,
  ambientAmplitude,
  isMobile,
  pointBudget,
}: PhysicalWorldSceneProps) {
  const lifeCenter: [number, number, number] = isMobile
    ? MOBILE_LIFE_CENTER
    : [
        lerp(DESKTOP_LIFE_EARLY[0], DESKTOP_LIFE_FINAL[0], scene.lifeHandoffT),
        DESKTOP_LIFE_EARLY[1],
        lerp(DESKTOP_LIFE_EARLY[2], DESKTOP_LIFE_FINAL[2], scene.lifeHandoffT),
      ];
  const machineCenter = isMobile ? MOBILE_MACHINE_CENTER : DESKTOP_MACHINE_CENTER;
  const environmentRegion = isMobile ? MOBILE_ENVIRONMENT_REGION : DESKTOP_ENVIRONMENT_REGION;

  return (
    <>
      {/* Strong depth fade so distance does the depth-perception work,
          rather than an obvious lit "product render" look. Mobile's
          camera and content both sit much closer to the origin, so it
          gets its own tighter fog range. */}
      <fog attach="fog" args={isMobile ? [VOID_COLOR, 2, 8] : [VOID_COLOR, 6, 17]} />
      <ambientLight intensity={0.55} />
      <directionalLight position={[2, 6, 4]} intensity={0.25} />

      <CameraRig position={scene.cameraPosition} lookAt={scene.cameraLookAt} />

      <SignalAnchor anchor={signalAnchor} boost={scene.signalBoost} />

      <SpatialGrid
        gridOpacity={scene.gridOpacity}
        measurementOpacity={scene.measurementOpacity}
        secondaryTraceOpacity={scene.secondaryTraceOpacity}
        isMobile={isMobile}
      />

      <StructuralPoints
        opacity={scene.depthPointsOpacity}
        count={pointBudget.structural}
        isMobile={isMobile}
      />

      <LifeField
        visibility={scene.lifeVisibility}
        count={pointBudget.life}
        ambientAmplitude={ambientAmplitude}
        center={lifeCenter}
        heightScale={isMobile ? 0.55 : 1}
      />

      <MachineField
        visibility={scene.machineVisibility}
        axisOpacity={scene.machineAxisOpacity}
        pointCount={pointBudget.machine}
        center={machineCenter}
        heightScale={isMobile ? 0.55 : 1}
      />

      <EnvironmentField
        visibility={scene.environmentVisibility}
        count={pointBudget.environment}
        ambientAmplitude={ambientAmplitude}
        region={environmentRegion}
      />

      <FieldConnections
        opacity={scene.fieldConnectionOpacity}
        machineCenter={machineCenter}
        environmentAnchor={[machineCenter[0] + 1.6, 0.4, machineCenter[2] + 1.4]}
      />

      <CentralBridge
        opacity={scene.centralBridgeOpacity}
        count={pointBudget.bridge}
        lifeCenter={lifeCenter}
        machineCenter={machineCenter}
      />
    </>
  );
}
