// Drop-in R3F body for AEGIS. Put aegis-body.glb in web/public/models/.
// Anatomy: BodyParts3D 4.0 (© Database Center for Life Science, CC BY 4.0) via ashemag/human-atlas (MIT).
import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";

export type Region = "brain" | "heart" | "blood" | "bones" | "whole_body";
export type Status = "green" | "amber" | "red";

// GLB node -> clickable region from the data contract. Load-bearing bones and
// antigravity muscles light up with "bones" (that's where microgravity bone and muscle loss happens).
const NODE_REGION: Record<string, Region> = {
  brain: "brain",
  heart: "heart",
  blood: "blood",
  bones: "bones",
  bones_loadbearing: "bones",
  muscle_antigravity: "bones",
  whole_body: "whole_body",
};

const STATUS_COLOR: Record<Status, string> = { green: "#22c55e", amber: "#f59e0b", red: "#ef4444" };
const BASE = { bones: "#d9d6cf", organ: "#c9ccd6", skin: "#9fb8ff", muscle: "#c98a8a" };

type Props = {
  status: Partial<Record<Region, Status>>;
  selected?: Region | null;
  onSelect?: (r: Region) => void;
};

export function AegisBody({ status, selected, onSelect }: Props) {
  const { scene } = useGLTF("/models/aegis-body.glb");
  const [hovered, setHovered] = useState<Region | null>(null);
  const t = useRef(0);

  // One material per node so each region can glow on its own.
  const mats = useMemo(() => {
    const out: Record<string, THREE.MeshPhysicalMaterial> = {};
    scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const node = mesh.name in NODE_REGION ? mesh.name : mesh.parent?.name ?? mesh.name;
      const skin = node === "whole_body";
      const m = new THREE.MeshPhysicalMaterial({
        color: skin ? BASE.skin : node.startsWith("bones") ? BASE.bones : node.startsWith("muscle") ? BASE.muscle : BASE.organ,
        roughness: 0.55,
        transparent: skin,
        opacity: skin ? 0.12 : 1,
        depthWrite: !skin,
        side: skin ? THREE.DoubleSide : THREE.FrontSide,
        clearcoat: skin ? 1 : 0.2,
      });
      mesh.material = m;
      mesh.userData.region = NODE_REGION[node];
      mesh.userData.node = node;
      out[node] = m;
    });
    return out;
  }, [scene]);

  useEffect(() => () => Object.values(mats).forEach((m) => m.dispose()), [mats]);

  // Status glow; red pulses, hovered/selected brighten. Green stays calm (subtle tint only).
  useFrame((_, dt) => {
    t.current += dt;
    for (const [node, m] of Object.entries(mats)) {
      const region = NODE_REGION[node];
      const s = status[region] ?? "green";
      const c = new THREE.Color(STATUS_COLOR[s]);
      const focus = region === selected || region === hovered;
      const pulse = s === "red" ? 0.5 + 0.5 * Math.sin(t.current * 4) : 1;
      const strength = (s === "green" ? 0.08 : 0.55) * pulse + (focus ? 0.35 : 0);
      if (node === "whole_body") {
        // Radiation/temperature aura: the skin itself tints and gets more opaque when not green.
        m.color.lerp(s === "green" ? new THREE.Color(BASE.skin) : c, 0.1);
        m.opacity = THREE.MathUtils.lerp(m.opacity, s === "green" ? 0.1 : 0.22 * pulse + 0.08, 0.1);
      }
      m.emissive.copy(c);
      m.emissiveIntensity = THREE.MathUtils.lerp(m.emissiveIntensity, strength, 0.15);
    }
  });

  const regionOf = (e: ThreeEvent<PointerEvent | MouseEvent>) => {
    // Skin sits in front of everything: skip it if an organ is behind it on the ray.
    const hit = e.intersections.find((i) => i.object.userData.region && i.object.userData.node !== "whole_body")
      ?? e.intersections.find((i) => i.object.userData.region);
    return (hit?.object.userData.region as Region | undefined) ?? null;
  };

  return (
    <primitive
      object={scene}
      onPointerMove={(e: ThreeEvent<PointerEvent>) => { e.stopPropagation(); setHovered(regionOf(e)); }}
      onPointerOut={() => setHovered(null)}
      onClick={(e: ThreeEvent<MouseEvent>) => { e.stopPropagation(); const r = regionOf(e); if (r) onSelect?.(r); }}
    />
  );
}

useGLTF.preload("/models/aegis-body.glb");

/* Usage (camera framed on a 1.72 m body standing at the origin):

<Canvas camera={{ position: [0, 1.0, 2.6], fov: 35 }}>
  <ambientLight intensity={0.5} />
  <directionalLight position={[2, 3, 2]} intensity={1.2} />
  <Suspense fallback={null}>
    <AegisBody status={crew.status} selected={region} onSelect={setRegion} />
  </Suspense>
  <OrbitControls target={[0, 0.95, 0]} enablePan={false} minDistance={1.2} maxDistance={4} />
</Canvas>
*/
