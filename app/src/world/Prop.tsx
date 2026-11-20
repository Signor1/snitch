import { useGLTF } from "@react-three/drei";
import { useMemo } from "react";
import * as THREE from "three";

/**
 * Scanned model fitted to a size and stood on the floor. Library models have arbitrary
 * scale and pivot, so pass one target size in metres (height, width, depth or longest).
 */
export function Prop({
  url,
  height,
  width,
  depth,
  longest,
  emissive,
  tint,
  paint,
  hide,
  ...props
}: {
  url: string;
  height?: number;
  width?: number;
  depth?: number;
  longest?: number;
  /** Multiplies the model's own emissive. */
  emissive?: number;
  /** Multiplied over the model's own colours. */
  tint?: string;
  /** Body colour for a vehicle: replaces the paint, keeps glass, trim and lamps. */
  paint?: string;
  /** Node names to hide, e.g. a counter's goods once stolen. */
  hide?: string[];
} & Omit<React.ComponentProps<"group">, "children">) {
  const gltf = useGLTF(url);
  const { object, scale, offset } = useMemo(() => {
    gltf.scene.traverse(plainGlass);
    const object = gltf.scene.clone(true);
    object.traverse((o) => {
      if (hide?.includes(o.name)) o.visible = false;
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.castShadow = true;
      m.receiveShadow = true;
      if (paint && /paint|body/i.test((m.material as THREE.Material).name)) {
        // a respray: the old colour and any baked glow go, the panel shape and gloss stay
        const mat = (m.material = (m.material as THREE.MeshStandardMaterial).clone());
        mat.map = null;
        mat.emissiveMap = null;
        mat.emissive.set("#000000");
        mat.color.set(paint);
      }
      if (emissive !== undefined || tint) {
        const mat = (m.material = (m.material as THREE.MeshStandardMaterial).clone());
        if (emissive !== undefined) {
          mat.emissiveIntensity = emissive;
          if (mat.emissive.getHex() === 0) mat.emissive.set("#ffffff");
        }
        // Only opaque paint is tinted, not glass or lamps.
        if (tint && mat.opacity >= 1 && !(mat as THREE.MeshPhysicalMaterial).transmission && !/glass|window|light|lamp|tire|tyre|wheel/i.test(mat.name)) mat.color.multiply(new THREE.Color(tint));
      }
    });
    // Fit by the whole model so hiding a part never resizes the rest.
    const box = new THREE.Box3().setFromObject(gltf.scene);
    const size = box.getSize(new THREE.Vector3());
    const scale = height ? height / size.y : width ? width / size.x : depth ? depth / size.z : (longest ?? 1) / Math.max(size.x, size.y, size.z);
    const c = box.getCenter(new THREE.Vector3());
    return { object, scale, offset: new THREE.Vector3(-c.x, -box.min.y, -c.z) };
  }, [gltf.scene, height, width, depth, longest, emissive, tint, paint, hide?.join()]);
  return (
    <group {...props}>
      <group scale={scale}>
        <primitive object={object} position={offset} />
      </group>
    </group>
  );
}

/**
 * Scanned glass uses transmission, which makes three.js draw the whole scene a second time every frame just
 * to show what's behind it. Plain see-through glass looks the same at this size and costs nothing extra.
 */
function plainGlass(o: THREE.Object3D) {
  const mat = (o as THREE.Mesh).material as THREE.MeshPhysicalMaterial | undefined;
  if (!mat?.isMeshPhysicalMaterial || !mat.transmission) return;
  mat.opacity = Math.min(mat.opacity, 0.25 + 0.5 * (1 - mat.transmission));
  mat.transmission = 0;
  mat.transparent = true;
  mat.depthWrite = false;
  mat.needsUpdate = true;
}
