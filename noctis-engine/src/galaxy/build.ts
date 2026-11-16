import type { Galaxy, PlanetNode, RawObject, StarNode } from './types.ts'
import { placePlanet, placeStar } from './place.ts'
import { inferPlanetType, inferStarClass } from './catalog.ts'

export function buildGalaxy(objects: RawObject[], guide: Map<string, string>): Galaxy {
  const stars: StarNode[] = []
  const starsById = new Map<number, StarNode>()
  const planetRecords: RawObject[] = []

  for (const o of objects) {
    if (o.kind === 'star') {
      const node: StarNode = { ...o, position: placeStar(o.idBytes), planets: [], starClass: inferStarClass(o.id) }
      stars.push(node)
      starsById.set(o.id, node)
    } else {
      planetRecords.push(o)
    }
  }

  const orphans: PlanetNode[] = []
  let linkedPlanets = 0
  for (const p of planetRecords) {
    const parent = starsById.get(p.id - p.slot)
    const planetType = inferPlanetType(p.id, p.slot)
    if (parent) {
      const planet: PlanetNode = {
        ...p,
        position: placePlanet(parent.position, p.idBytes, p.slot),
        parentKey: parent.idKey,
        parentName: parent.name,
        planetType,
      }
      parent.planets.push(planet)
      linkedPlanets++
    } else {
      orphans.push({
        ...p,
        position: placeStar(p.idBytes),
        parentKey: '',
        parentName: '',
        planetType,
      })
    }
  }

  return {
    stars,
    orphans,
    guide,
    stats: {
      starCount: stars.length,
      planetCount: planetRecords.length,
      guideEntries: guide.size,
      orphanPlanets: orphans.length,
      linkedPlanets,
    },
  }
}
