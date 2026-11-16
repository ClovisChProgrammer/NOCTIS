import type { RawObject } from './types.ts'

const STARMAP_HEADER = 4
const STARMAP_RECORD = 32
const GUIDE_HEADER = 4
const GUIDE_RECORD = 84

const REMOVED = [0x52, 0x65, 0x6d, 0x6f, 0x76, 0x65, 0x64, 0x3a]

function hexKey(bytes: Uint8Array, off: number): string {
  let s = ''
  for (let i = 0; i < 8; i++) s += bytes[off + i].toString(16).padStart(2, '0')
  return s
}

function readText(bytes: Uint8Array, off: number, len: number): string {
  let s = ''
  for (let i = 0; i < len; i++) {
    const c = bytes[off + i]
    if (c === 0) break
    s += String.fromCharCode(c)
  }
  return s
}

function isRemoved(bytes: Uint8Array, off: number): boolean {
  for (let i = 0; i < 8; i++) if (bytes[off + i] !== REMOVED[i]) return false
  return true
}

function declaredLength(view: DataView, byteLength: number): number {
  const declared = view.getInt32(0, true)
  return declared > 0 && declared <= byteLength ? declared : byteLength
}

export function parseStarmap(buf: ArrayBuffer): RawObject[] {
  const bytes = new Uint8Array(buf)
  const view = new DataView(buf)
  const total = declaredLength(view, buf.byteLength)
  const count = Math.floor((total - STARMAP_HEADER) / STARMAP_RECORD)
  const out: RawObject[] = []
  for (let i = 0; i < count; i++) {
    const off = STARMAP_HEADER + i * STARMAP_RECORD
    if (isRemoved(bytes, off)) continue
    const id = view.getFloat64(off, true)
    const idKey = hexKey(bytes, off)
    const labelOff = off + 8
    const name = readText(bytes, labelOff, 21).trim()
    const typeByte = bytes[labelOff + 21]
    const kind = typeByte === 0x50 ? 'planet' : 'star'
    const d0 = bytes[labelOff + 22]
    const d1 = bytes[labelOff + 23]
    const isDigit = d0 >= 0x30 && d0 <= 0x39 && d1 >= 0x30 && d1 <= 0x39
    const slot = kind === 'planet' && isDigit ? (d0 - 0x30) * 10 + (d1 - 0x30) : 0
    const variant = isDigit ? String.fromCharCode(d0) + String.fromCharCode(d1) : '00'
    out.push({ kind, id, idBytes: bytes.slice(off, off + 8), idKey, name, variant, slot })
  }
  return out
}

export function parseGuide(buf: ArrayBuffer): Map<string, string> {
  const bytes = new Uint8Array(buf)
  const view = new DataView(buf)
  const total = declaredLength(view, buf.byteLength)
  const count = Math.floor((total - GUIDE_HEADER) / GUIDE_RECORD)
  const map = new Map<string, string>()
  for (let i = 0; i < count; i++) {
    const off = GUIDE_HEADER + i * GUIDE_RECORD
    const idKey = hexKey(bytes, off)
    const chunk = readText(bytes, off + 8, 76).replace(/[ .]+$/g, '')
    if (!chunk) continue
    const prev = map.get(idKey)
    map.set(idKey, prev ? prev + ' ' + chunk : chunk)
  }
  for (const [k, v] of map) map.set(k, v.replace(/\s+/g, ' ').trim())
  return map
}
