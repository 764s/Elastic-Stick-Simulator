
import { Vector3 } from '../types';

export const Vec3 = {
  create: (x = 0, y = 0, z = 0): Vector3 => ({ x, y, z }),
  
  add: (a: Vector3, b: Vector3): Vector3 => ({
    x: a.x + b.x,
    y: a.y + b.y,
    z: a.z + b.z
  }),

  sub: (a: Vector3, b: Vector3): Vector3 => ({
    x: a.x - b.x,
    y: a.y - b.y,
    z: a.z - b.z
  }),

  scale: (v: Vector3, s: number): Vector3 => ({
    x: v.x * s,
    y: v.y * s,
    z: v.z * s
  }),

  dot: (a: Vector3, b: Vector3): number => a.x * b.x + a.y * b.y + a.z * b.z,

  length: (v: Vector3): number => Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z),

  normalize: (v: Vector3): Vector3 => {
    const len = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
    if (len === 0) return { x: 0, y: 0, z: 0 };
    return { x: v.x / len, y: v.y / len, z: v.z / len };
  },

  distance: (a: Vector3, b: Vector3): number => {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    const dz = a.z - b.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  },

  lerp: (a: Vector3, b: Vector3, t: number): Vector3 => ({
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    z: a.z + (b.z - a.z) * t,
  })
};
