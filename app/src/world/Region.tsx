import { useFrame } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import * as THREE from "three";

// The hideout, street and shop sit side by side along x. Only the one the camera is in gets drawn: hidden sets
// cost no draw calls, and their lights drop out of every shader's light loop, which is what phones choke on.

const regions = new Map<number, THREE.Group>();
const NEAR = 40;

export function Region({ x, children }: { x: number; children: React.ReactNode }) {
  const g = useRef<THREE.Group>(null);
  useEffect(() => {
    const o = g.current!;
    regions.set(x, o);
    return () => void regions.delete(x);
  }, [x]);
  useFrame(({ camera }) => {
    if (g.current) g.current.visible = Math.abs(camera.position.x - x) < NEAR;
  });
  return <group ref={g}>{children}</group>;
}

/**
 * Compile the shaders a set will use, with only that set's lights in play, so walking in doesn't stall.
 * compileAsync builds the programs synchronously before it returns its promise; the next frame restores visibility.
 */
export function precompile(gl: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, xs: number[]) {
  for (const x of xs) {
    for (const [rx, o] of regions) o.visible = rx === x;
    void gl.compileAsync(scene, camera).catch(() => {});
  }
}
