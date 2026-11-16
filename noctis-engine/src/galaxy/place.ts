import type { Vec3 } from './types.ts'

export const GALAXY_EXTENT = 131072

const FNV_PRIME = 0x01000193
const SEED_X = 0x9e3779b9
const SEED_Y = 0x85ebca6b
const SEED_Z = 0xc2b2ae35
const SEED_ANGLE = 0x1b873593
const SEED_RADIUS = 0x27d4eb2f
const SEED_TILT = 0x165667b1

function fnv1a(bytes: Uint8Array, seed: number): number {
  let h = seed >>> 0
  for (let i = 0; i < bytes.length; i++) {
    h ^= bytes[i]
    h = Math.imul(h, FNV_PRIME) >>> 0
  }
  return h >>> 0
}

function unit(h: number): number {
  return h / 4294967296
}

export function placeStar(idBytes: Uint8Array): Vec3 {
  return {
    x: unit(fnv1a(idBytes, SEED_X)) * GALAXY_EXTENT,
    y: unit(fnv1a(idBytes, SEED_Y)) * GALAXY_EXTENT,
    z: unit(fnv1a(idBytes, SEED_Z)) * GALAXY_EXTENT,
  }
}

export function placePlanet(star: Vec3, idBytes: Uint8Array, slot: number): Vec3 {
  const angle = unit(fnv1a(idBytes, SEED_ANGLE)) * Math.PI * 2
  const radius = 300 + unit(fnv1a(idBytes, SEED_RADIUS)) * 1600 + slot * 40
  const tilt = unit(fnv1a(idBytes, SEED_TILT)) * 0.5 - 0.25
  return {
    x: star.x + Math.cos(angle) * radius,
    y: star.y + Math.sin(angle * 2) * radius * tilt,
    z: star.z + Math.sin(angle) * radius,
  }
}
