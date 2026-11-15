// The side inspector: the selected organ on its own (cut out of the same body model) plus a cell-scale close-up.
import { Suspense, useEffect, useMemo } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import type { Vis } from "./derive";
import type { Target } from "./targets";
import { bodyGeometries, makeMaterials, syncMaterials, useBody, v3 } from "./BodyScene";
import { Micro } from "./Micro";

function boxPlanes(c: number[], h: number[]) {
  return [0, 1, 2].flatMap((i) => {
    const n = [0, 0, 0]; n[i] = 1;
    return [new THREE.Plane(new THREE.Vector3(n[0], n[1], n[2]), -(c[i] - h[i])), new THREE.Plane(new THREE.Vector3(-n[0], -n[1], -n[2]), c[i] + h[i])];
  });
}

function Organ({ target, vis }: { target: Target; vis: Vis }) {
  const scene = useBody();
  const { gl, camera } = useThree();
  const { mats, parts } = useMemo(() => {
    const geo = bodyGeometries(scene), mats = makeMaterials();
    const planes = boxPlanes(target.box.c, target.box.h);
    const parts = target.nodes.filter((n) => geo[n]).map((n) => {
      const mat = mats[n];
      if (n !== "skin") { mat.clippingPlanes = planes; mat.transparent = false; mat.depthWrite = true; (mat as THREE.Material & { opacity: number }).opacity = 1; }
      return { n, geometry: geo[n], material: mat };
    });
    return { mats, parts };
  }, [scene, target.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { gl.localClippingEnabled = true; }, [gl]);
  useEffect(() => () => Object.values(mats).forEach((m) => m.dispose()), [mats]);
  useEffect(() => {
    const c = v3(target.box.c), cam = camera as THREE.PerspectiveCamera;
    const R = Math.max(target.box.h[0], target.box.h[1] * 0.95, target.box.h[2]);
    const dist = (R / Math.tan((cam.fov * Math.PI) / 360)) * 1.25;
    cam.position.copy(c).add(v3(target.view ?? [0.45, 0.2, 1]).normalize().multiplyScalar(dist));
    cam.near = dist / 50; cam.far = dist * 20; cam.updateProjectionMatrix();
    cam.lookAt(c);
  }, [camera, target.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useFrame(() => syncMaterials(mats, vis, 0.08));

  return (
    <>
      {parts.map((p) => <mesh key={p.n} geometry={p.geometry} material={p.material} frustumCulled={false} renderOrder={p.n === "skin" ? 10 : 0} />)}
      <OrbitControls target={target.box.c as [number, number, number]} enablePan={false} autoRotate={target.spin} autoRotateSpeed={1.1} enableDamping />
    </>
  );
}

export function OrganView({ target, vis }: { target: Target; vis: Vis }) {
  return (
    <Canvas key={target.id} dpr={[1, 1.75]} camera={{ fov: 30 }} gl={{ antialias: true }}>
      <ambientLight intensity={0.5} />
      <directionalLight position={[2, 3, 4]} intensity={2} />
      <directionalLight position={[-3, 1, -2]} intensity={1.2} color="#7aa6ff" />
      <hemisphereLight args={["#bcd0ff", "#201014", 0.6]} />
      <Suspense fallback={null}><Organ target={target} vis={vis} /></Suspense>
    </Canvas>
  );
}

export function MicroView({ target, vis }: { target: Target; vis: Vis }) {
  return (
    <Canvas key={target.micro} dpr={[1, 1.75]} camera={{ position: [0, 0.5, 6.2], fov: 32 }} gl={{ antialias: true }}>
      <Micro kind={target.micro} vis={vis} />
    </Canvas>
  );
}
