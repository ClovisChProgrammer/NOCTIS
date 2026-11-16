export type ObjectKind = 'star' | 'planet'

export interface RawObject {
  kind: ObjectKind
  id: number
  idBytes: Uint8Array
  idKey: string
  name: string
  variant: string
  slot: number
}

export interface Vec3 {
  x: number
  y: number
  z: number
}

export interface PlanetNode extends RawObject {
  position: Vec3
  parentKey: string
  parentName: string
  planetType: number
}

export interface StarNode extends RawObject {
  position: Vec3
  planets: PlanetNode[]
  starClass: number
}

export interface GalaxyStats {
  starCount: number
  planetCount: number
  guideEntries: number
  orphanPlanets: number
  linkedPlanets: number
}

export interface Galaxy {
  stars: StarNode[]
  orphans: PlanetNode[]
  guide: Map<string, string>
  stats: GalaxyStats
}
