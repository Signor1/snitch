import { useTexture } from "@react-three/drei";
import { useMemo } from "react";
import * as THREE from "three";

export type Surface = "asphalt_road" | "pavement_concrete" | "brick_red" | "brick_dark" | "concrete_wall" | "plaster_worn" | "facade_tiles_dark" | "metal_shutter" | "corrugated_iron" | "floor_tiles_checker" | "wood_floor_worn";

/** `metres` is the real size of one tile of the scan; pass the face size and it tiles itself. */
export function useSurface(name: Surface, size: [number, number], metres = 2, opts: { roughness?: number; color?: string; envMapIntensity?: number; /** Keep the scan's relief, not its colour. */ painted?: boolean; /** Strength of the surface relief, 1 = as scanned. */ relief?: number } = {}) {
  const [color, normal, arm] = useTexture([`/real/textures/${name}_color.webp`, `/real/textures/${name}_normal.webp`, `/real/textures/${name}_arm.webp`]);
  return useMemo(() => {
    const prep = (t: THREE.Texture, srgb: boolean) => {
      const c = t.clone();
      c.wrapS = c.wrapT = THREE.RepeatWrapping;
      c.repeat.set(size[0] / metres, size[1] / metres);
      c.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      c.anisotropy = 8;
      c.needsUpdate = true;
      return c;
    };
    const a = prep(arm, false);
    return new THREE.MeshStandardMaterial({
      map: opts.painted ? null : prep(color, true),
      normalMap: prep(normal, false),
      normalScale: new THREE.Vector2(opts.relief ?? 1, opts.relief ?? 1),
      aoMap: a,
      roughnessMap: a,
      metalnessMap: a,
      roughness: opts.roughness ?? 1,
      metalness: 1,
      color: opts.color ?? "#ffffff",
      envMapIntensity: opts.envMapIntensity ?? 1,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [color, normal, arm, size[0], size[1], metres, opts.roughness, opts.color, opts.envMapIntensity, opts.painted, opts.relief]);
}
