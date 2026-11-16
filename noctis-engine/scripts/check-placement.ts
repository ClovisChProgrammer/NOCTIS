import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { parseGuide, parseStarmap } from '../src/galaxy/parse.ts'
import { buildGalaxy } from '../src/galaxy/build.ts'

function ab(b: Buffer): ArrayBuffer {
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer
}

const sm = readFileSync(fileURLToPath(new URL('../public/data/STARMAP.BIN', import.meta.url)))
const gd = readFileSync(fileURLToPath(new URL('../public/data/GUIDE.BIN', import.meta.url)))
const g = buildGalaxy(parseStarmap(ab(sm)), parseGuide(ab(gd)))

const S = 1 / 128
const fenia = g.stars.find((s) => s.name === 'FENIA')!
const eye = [fenia.position.x * S, fenia.position.y * S + 6, fenia.position.z * S + 24]

let best = fenia
let bd = Infinity
for (const st of g.stars) {
  const dx = st.position.x * S - eye[0]
  const dy = st.position.y * S - eye[1]
  const dz = st.position.z * S - eye[2]
  const d = Math.hypot(dx, dy, dz)
  if (d < bd) {
    bd = d
    best = st
  }
}

const between = (a: typeof fenia, b: typeof fenia) =>
  Math.hypot(a.position.x - b.position.x, a.position.y - b.position.y, a.position.z - b.position.z)

const erm = g.stars.find((s) => s.name === 'ERM')

console.log('FENIA pos (galaxy units):', fenia.position)
console.log('nearest to eye:', best.name, '|', bd.toFixed(2), 'scaled u')
console.log('distance FENIA->ERM (galaxy units):', erm ? between(fenia, erm).toFixed(1) : 'n/a')

let near = 0
for (const st of g.stars) {
  if (st === fenia) continue
  if (between(fenia, st) < 5000) near++
}
console.log('stars within 5000 units of FENIA:', near)
