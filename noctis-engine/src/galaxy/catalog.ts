export interface PlanetTypeInfo {
  type: number
  description: string
  color: [number, number, number]
  colorVar: number
  avgRay: number
  possibleMoons: number
}

export interface StarClassInfo {
  classId: number
  description: string
  color: [number, number, number]
  ray: number
  rayVar: number
  act: number
  maxPlanets: number
}

// From Noctis IV / NIV+ original (NOCTIS-0.CPP) - see CATALOGO_TIPOS_NOCTIS.md
export const PLANET_TYPES: PlanetTypeInfo[] = [
  { type: 0, description: 'medium size, internally hot, unstable surface, no atmosphere.', color: [60, 30, 15], colorVar: 20, avgRay: 0.007, possibleMoons: 1 },
  { type: 1, description: 'small, solid, dusty, craterized, no atmosphere.', color: [40, 50, 40], colorVar: 25, avgRay: 0.003, possibleMoons: 1 },
  { type: 2, description: 'medium size, solid, thick atmosphere, fully covered by clouds.', color: [32, 32, 32], colorVar: 32, avgRay: 0.010, possibleMoons: 2 },
  { type: 3, description: 'medium size, felisian, breathable atmosphere, suitable for life.', color: [16, 32, 48], colorVar: 40, avgRay: 0.011, possibleMoons: 3 },
  { type: 4, description: 'medium size, rocky, creased, no atmosphere.', color: [32, 40, 32], colorVar: 20, avgRay: 0.010, possibleMoons: 2 },
  { type: 5, description: 'small, solid, thin atmosphere.', color: [32, 32, 32], colorVar: 32, avgRay: 0.008, possibleMoons: 2 },
  { type: 6, description: 'large, not consistent, covered with dense clouds.', color: [32, 32, 32], colorVar: 32, avgRay: 0.064, possibleMoons: 18 },
  { type: 7, description: 'small, solid, icy surface, no atmosphere.', color: [32, 40, 48], colorVar: 24, avgRay: 0.009, possibleMoons: 2 },
  { type: 8, description: 'medium size, surface is mainly native quartz, oxygen atmosphere.', color: [40, 40, 40], colorVar: 30, avgRay: 0.012, possibleMoons: 3 },
  { type: 9, description: 'very large, substellar object, not consistent.', color: [50, 25, 10], colorVar: 20, avgRay: 0.125, possibleMoons: 20 },
  { type: 10, description: 'companion star - not a planet.', color: [40, 40, 40], colorVar: 40, avgRay: 5.000, possibleMoons: 20 },
]

export const STAR_CLASSES: StarClassInfo[] = [
  { classId: 0, description: 'medium size, orange main sequence star, strong gravity well around.', color: [255, 160, 96], ray: 5000, rayVar: 2000, act: 2, maxPlanets: 12 },
  { classId: 1, description: 'large, white main sequence star, very strong gravity field.', color: [255, 255, 255], ray: 15000, rayVar: 10000, act: 4, maxPlanets: 18 },
  { classId: 2, description: 'red dwarf, small main sequence star, weak gravity well.', color: [255, 96, 64], ray: 300, rayVar: 200, act: 1, maxPlanets: 8 },
  { classId: 3, description: 'extremely large, blue supergiant, deadly gravity strength.', color: [128, 128, 255], ray: 20000, rayVar: 15000, act: 6, maxPlanets: 15 },
  { classId: 4, description: 'white giant star, intense gravity field.', color: [255, 255, 255], ray: 15000, rayVar: 5000, act: 5, maxPlanets: 20 },
  { classId: 5, description: 'yellowish dwarf, very weak gravity field around.', color: [255, 255, 128], ray: 1000, rayVar: 1000, act: 10, maxPlanets: 3 },
  { classId: 6, description: 'double star with a major yellowish dwarf component and a secondary blue dwarf, weak but irregular gravity.', color: [255, 255, 192], ray: 3000, rayVar: 3000, act: 100, maxPlanets: 0 },
  { classId: 7, description: 'red dwarf with a smaller, orbiting brown dwarf, very weak gravity.', color: [255, 64, 32], ray: 2000, rayVar: 1000, act: 1, maxPlanets: 1 },
  { classId: 8, description: 'large, red giant star, very strong gravity field around.', color: [255, 128, 32], ray: 4000, rayVar: 2000, act: 2, maxPlanets: 7 },
  { classId: 9, description: 'white dwarf star, intense gravity field.', color: [255, 255, 255], ray: 1500, rayVar: 1000, act: 1, maxPlanets: 20 },
  { classId: 10, description: 'very small, blue dwarf star, strong gravity well around.', color: [128, 128, 255], ray: 30000, rayVar: 5000, act: 10, maxPlanets: 2 },
  { classId: 11, description: 'tiny pulsar object, unsafe, high radiation, strong gravity.', color: [128, 255, 128], ray: 250, rayVar: 0, act: 1, maxPlanets: 5 },
]

// Deterministic pseudo-type for planets from STARMAP (0..9) since engine lacks full procedural generation
export function inferPlanetType(id: number, slot: number): number {
  const x = Math.abs(Math.floor(id * 0.6180339887498948 + slot * 2.399963229728653)) >>> 0
  return x % 10
}

export function inferStarClass(id: number): number {
  const x = Math.abs(Math.floor(id * 1.6180339887498948)) >>> 0
  return x % 12
}

function hash01(n: number): number {
  let x = Math.abs(n | 0) >>> 0
  x ^= x >>> 16; x = Math.imul(x, 0x7feb352d) >>> 0
  x ^= x >>> 15; x = Math.imul(x, 0x846ca68b) >>> 0
  x ^= x >>> 16
  return (x >>> 0) / 4294967296
}

export function planetVisualFromCatalog(type: number, id: number, slot: number): { color: [number, number, number]; size: number; disk: number } {
  const info = PLANET_TYPES[Math.max(0, Math.min(10, type))] ?? PLANET_TYPES[1]
  const v = (hash01((id | 0) ^ (slot * 131542391)) - 0.5) * 2 // -1..1
  const boost = 1.35 // brighten for dark background
  const r = Math.min(1, Math.max(0, (info.color[0] + v * info.colorVar * 0.35) / 64 * boost))
  const g = Math.min(1, Math.max(0, (info.color[1] + v * info.colorVar * 0.35) / 64 * boost))
  const b = Math.min(1, Math.max(0, (info.color[2] + v * info.colorVar * 0.35) / 64 * boost))
  // size/disk scaled from avgRay (0.003..0.125, companion 5.0 clamped)
  const ray = Math.min(info.avgRay, 0.2)
  const base = 2.2 + (ray / 0.125) * 7.5 // ~2.2..9.7
  const jitter = 1 + (hash01(((id * 2654435761) ^ slot) | 0) - 0.5) * 0.35
  const size = base * jitter
  const disk = Math.max(size * 1.15, 3.0)
  return { color: [r, g, b], size, disk }
}

export function starVisualFromCatalog(classId: number, id: number): { color: [number, number, number]; size: number } {
  const info = STAR_CLASSES[Math.max(0, Math.min(11, classId))] ?? STAR_CLASSES[0]
  const v = (hash01(id | 0) - 0.5) * 0.3
  const r = Math.min(1, Math.max(0.1, info.color[0] / 255 + v))
  const g = Math.min(1, Math.max(0.1, info.color[1] / 255 + v))
  const b = Math.min(1, Math.max(0.1, info.color[2] / 255 + v))
  const s = 0.6 + (Math.min(info.ray, 30000) / 30000) * 2.0
  return { color: [r, g, b], size: s }
}
