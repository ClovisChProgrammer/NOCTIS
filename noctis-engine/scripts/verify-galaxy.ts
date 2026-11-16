import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { parseGuide, parseStarmap } from '../src/galaxy/parse.ts'
import { buildGalaxy } from '../src/galaxy/build.ts'

function toArrayBuffer(b: Buffer): ArrayBuffer {
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer
}

const starmapPath = fileURLToPath(new URL('../public/data/STARMAP.BIN', import.meta.url))
const guidePath = fileURLToPath(new URL('../public/data/GUIDE.BIN', import.meta.url))

const starmap = readFileSync(starmapPath)
const guide = readFileSync(guidePath)

const objects = parseStarmap(toArrayBuffer(starmap))
const guideMap = parseGuide(toArrayBuffer(guide))
const galaxy = buildGalaxy(objects, guideMap)

console.log('STARMAP bytes:', starmap.length, '| records parsed:', objects.length)
console.log('GUIDE bytes:', guide.length, '| entries:', guideMap.size)
console.log('stats:', JSON.stringify(galaxy.stats, null, 2))

const fenia = objects.find((o) => o.name === 'FENIA')
console.log('FENIA id:', fenia?.id, '| trunc(id*1e5):', fenia ? Math.trunc(fenia.id * 1e5) : null)

const dialis = galaxy.stars.find((s) => s.name === 'DIALIS')
console.log('DIALIS planets:', dialis?.planets.map((p) => `${p.name} (P${p.variant})`).join(', '))

const lyman = objects.find((o) => o.name === 'LYMAN RESERVE')
const lymanParent = lyman ? galaxy.stars.find((s) => s.id === lyman.id - lyman.slot) : undefined
console.log('LYMAN RESERVE -> parent:', lymanParent?.name, '| slot:', lyman?.slot)

const busiest = [...galaxy.stars].sort((a, b) => b.planets.length - a.planets.length)[0]
console.log('Most planets:', busiest?.name, '->', busiest?.planets.length)

console.log('First guide entries:')
let shown = 0
for (const [, text] of guideMap) {
  console.log('  -', text.slice(0, 140))
  if (++shown >= 2) break
}
