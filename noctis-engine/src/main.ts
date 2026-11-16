import './style.css'
import { parseGuide, parseStarmap } from './galaxy/parse.ts'
import { buildGalaxy } from './galaxy/build.ts'
import { lookAt, perspective } from './render/math.ts'
import { createStarfield } from './render/starfield.ts'
import { PLANET_TYPES, STAR_CLASSES, planetVisualFromCatalog, starVisualFromCatalog } from './galaxy/catalog.ts'

const RENDER_SCALE = 1 / 128
const PLANET_ORBIT_SCALE = 35 // exagero visual das órbitas para distinguir planetas e distâncias no sistema

type Target = { kind: 'star'; starIndex: number } | { kind: 'planet'; starIndex: number; planetIndex: number }

async function fetchBuffer(path: string): Promise<ArrayBuffer> {
  const res = await fetch(path)
  if (!res.ok) throw new Error(`${path}: ${res.status}`)
  return res.arrayBuffer()
}

function normalize(x: number, y: number, z: number): { x: number; y: number; z: number } {
  const l = Math.hypot(x, y, z) || 1
  return { x: x / l, y: y / l, z: z / l }
}

async function main(): Promise<void> {
  const app = document.querySelector<HTMLDivElement>('#app')!
  app.innerHTML = `
    <canvas id="view"></canvas>
    <div id="reticle"></div>
    <div id="hud"></div>
    <aside id="panel">
      <div class="panel-title">SISTEMA</div>
      <div id="panel-body">Sem alvo selecionado.</div>
    </aside>`
  const canvas = document.querySelector<HTMLCanvasElement>('#view')!
  const hud = document.querySelector<HTMLDivElement>('#hud')!
  const panelBody = document.querySelector<HTMLDivElement>('#panel-body')!
  const gl = canvas.getContext('webgl2', { antialias: true, preserveDrawingBuffer: true })
  if (!gl) {
    hud.textContent = 'WebGL2 indisponivel neste navegador.'
    return
  }

  const [starmapBuf, guideBuf] = await Promise.all([
    fetchBuffer('/data/STARMAP.BIN'),
    fetchBuffer('/data/GUIDE.BIN'),
  ])
  const galaxy = buildGalaxy(parseStarmap(starmapBuf), parseGuide(guideBuf))

  function starColor(s: { id: number; starClass: number }): [number, number, number] {
    return starVisualFromCatalog(s.starClass, s.id).color
  }
  function starSize(s: { id: number; starClass: number }): number {
    return starVisualFromCatalog(s.starClass, s.id).size
  }

  // interleaved: x,y,z,size,r,g,b per star
  const starData = new Float32Array(galaxy.stars.length * 7)
  for (let i = 0; i < galaxy.stars.length; i++) {
    const s = galaxy.stars[i]
    const p = s.position
    const c = starColor(s)
    const sz = starSize(s)
    const b = i * 7
    starData[b] = p.x * RENDER_SCALE
    starData[b + 1] = p.y * RENDER_SCALE
    starData[b + 2] = p.z * RENDER_SCALE
    starData[b + 3] = sz
    starData[b + 4] = c[0]
    starData[b + 5] = c[1]
    starData[b + 6] = c[2]
  }
  const starfield = createStarfield(gl, starData)
  const overlay = new Float32Array(4096 * 7) // planets/disks + target/hover highlights

  function starPos(i: number): [number, number, number] {
    const b = i * 7
    return [starData[b], starData[b + 1], starData[b + 2]]
  }

  function planetRenderPos(starIndex: number, planetIndex: number): [number, number, number] {
    const star = galaxy.stars[starIndex]
    const sp = starPos(starIndex)
    const pl = star.planets[planetIndex]
    // offset relativo ao sol em unidades da galáxia, com exagero visual
    const dx = (pl.position.x - star.position.x) * RENDER_SCALE * PLANET_ORBIT_SCALE
    const dy = (pl.position.y - star.position.y) * RENDER_SCALE * PLANET_ORBIT_SCALE
    const dz = (pl.position.z - star.position.z) * RENDER_SCALE * PLANET_ORBIT_SCALE
    return [sp[0] + dx, sp[1] + dy, sp[2] + dz]
  }

  const start = galaxy.stars.find((s) => s.name === 'FENIA') ?? galaxy.stars[0]
  const target: [number, number, number] = [
    start.position.x * RENDER_SCALE,
    start.position.y * RENDER_SCALE,
    start.position.z * RENDER_SCALE,
  ]
  const eye: [number, number, number] = [target[0], target[1] + 6, target[2] + 24]
  let yaw = 0
  let pitch = 0
  {
    const dir = normalize(target[0] - eye[0], target[1] - eye[1], target[2] - eye[2])
    yaw = Math.atan2(dir.x, dir.z)
    pitch = Math.asin(dir.y)
  }

  let selected: Target | null = null
  let pinned = false
  let selectionHistory: Target[] = []
  let hovered: Target | null = null
  let mouseNdc: { x: number; y: number } | null = null // null => use center (pointer lock/crosshair)

  type Autopilot = { target: Target }
  let autopilot: Autopilot | null = null

  function targetPos(t: Target): [number, number, number] {
    if (t.kind === 'star') return starPos(t.starIndex)
    return planetRenderPos(t.starIndex, t.planetIndex)
  }

  function distanceToTarget(t: Target): number {
    const [tx, ty, tz] = targetPos(t)
    return Math.hypot(tx - eye[0], ty - eye[1], tz - eye[2])
  }

  function wrapPi(a: number): number {
    while (a > Math.PI) a -= Math.PI * 2
    while (a < -Math.PI) a += Math.PI * 2
    return a
  }
  function lerpAngle(a: number, b: number, t: number): number {
    return a + wrapPi(b - a) * t
  }
  function autopilotStopDist(t: Target): number {
    if (t.kind === 'planet') {
      const pl = galaxy.stars[t.starIndex].planets[t.planetIndex]
      const vis = planetVisualFromCatalog(pl.planetType, pl.id, pl.slot)
      return Math.max(3.0, vis.disk * 0.55 + 2.0)
    }
    return 14
  }

  function nearestStar(): { index: number; distance: number } {
    let best = -1
    let bestD = Infinity
    for (let i = 0; i < galaxy.stars.length; i++) {
      const sp = starPos(i)
      const dx = sp[0] - eye[0]
      const dy = sp[1] - eye[1]
      const dz = sp[2] - eye[2]
      const d = dx * dx + dy * dy + dz * dz
      if (d < bestD) {
        bestD = d
        best = i
      }
    }
    return { index: best, distance: Math.sqrt(bestD) }
  }

  function currentTarget(): Target {
    if (pinned && selected) return selected
    return { kind: 'star', starIndex: nearestStar().index }
  }

  function setTarget(t: Target, pin = true, pushHistory = true): void {
    if (pushHistory && pinned && selected) {
      selectionHistory.push(selected)
      if (selectionHistory.length > 50) selectionHistory.shift()
    }
    selected = t
    pinned = pin
  }

  function unpinTarget(): void {
    autopilot = null
    pinned = false
    selected = null
    selectionHistory = []
  }

  function cycleStar(step: number): void {
    const cur = currentTarget()
    const next = (cur.starIndex + step + galaxy.stars.length) % galaxy.stars.length
    setTarget({ kind: 'star', starIndex: next }, true)
  }

  function cyclePlanet(step: number): void {
    const cur = currentTarget()
    const star = galaxy.stars[cur.starIndex]
    if (star.planets.length === 0) return
    if (cur.kind === 'planet') {
      const next = (cur.planetIndex + step + star.planets.length) % star.planets.length
      setTarget({ kind: 'planet', starIndex: cur.starIndex, planetIndex: next }, true)
    } else {
      const idx = step > 0 ? 0 : star.planets.length - 1
      setTarget({ kind: 'planet', starIndex: cur.starIndex, planetIndex: idx }, true)
    }
  }

  function goBackSelection(): void {
    const prev = selectionHistory.pop()
    if (prev) {
      selected = prev
      pinned = true
    } else {
      // sem histórico: volta ao modo automático (desafixa) em vez de "travar"
      unpinTarget()
    }
  }

  function escapeHtml(s: string): string {
    return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string))
  }

  function targetLabelOf(t: Target): string {
    const star = galaxy.stars[t.starIndex]
    return t.kind === 'planet' ? `${star.name} / ${star.planets[t.planetIndex].name}` : star.name
  }

  function updatePanel(t: Target, distance: number): void {
    const star = galaxy.stars[t.starIndex]
    const guide = galaxy.guide.get(star.idKey)
    const planets = star.planets.length
      ? star.planets
          .map((p, i) => {
            const active = t.kind === 'planet' && t.planetIndex === i ? ' class="active"' : ''
            const hoverCls = hovered && hovered.kind === 'planet' && hovered.starIndex === t.starIndex && hovered.planetIndex === i ? ' class="hover"' : ''
            const od = planetOrbitDist(t.starIndex, i).toFixed(1)
            const ptype = PLANET_TYPES[p.planetType] ?? PLANET_TYPES[1]
            return `<li${active || hoverCls}>${escapeHtml(p.name)} <span class="muted">(T${p.planetType}, slot ${p.slot}, órbita ~${od} u)</span><div class="muted small">${escapeHtml(ptype.description)}</div></li>`
          })
          .join('')
      : '<li class="muted">Nenhum planeta registrado</li>'
    const guideHtml = guide ? `<div class="guide">${escapeHtml(guide)}</div>` : '<div class="muted">Sem entrada no GUIDE.</div>'
    const targetLabel = targetLabelOf(t)
    const modeLabel = autopilot ? '<b style="color:#7fffd4">VIAGEM AUTOMÁTICA</b> (G/WASD cancela)' : (pinned ? '<b style="color:#fff3a8">ALVO FIXADO</b>' : 'mais próximo (auto) — pressione F para fixar')
    const sc = STAR_CLASSES[star.starClass] ?? STAR_CLASSES[0]
    const hoverLabel = hovered ? `<div class="kv hoverline"><span class="k">Sob mira</span><span class="v">${escapeHtml(targetLabelOf(hovered))}</span></div>` : ''
    const extraParts: string[] = []
    if (t.kind === 'planet') {
      const pl = star.planets[t.planetIndex]
      const ptype = PLANET_TYPES[pl.planetType] ?? PLANET_TYPES[1]
      extraParts.push(`<div class="kv"><span class="k">Órbita (visual)</span><span class="v">~${planetOrbitDist(t.starIndex, t.planetIndex).toFixed(1)} u do sol</span></div>`)
      extraParts.push(`<div class="kv"><span class="k">Tipo (catálogo)</span><span class="v">T${pl.planetType}</span></div>`)
      extraParts.push(`<div class="muted small">${escapeHtml(ptype.description)}</div>`)
    } else {
      extraParts.push(`<div class="kv"><span class="k">Classe estelar</span><span class="v">S${star.starClass}</span></div>`)
      extraParts.push(`<div class="muted small">${escapeHtml(sc.description)}</div>`)
    }
    panelBody.innerHTML = `
      <div class="kv"><span class="k">Alvo</span><span class="v">${escapeHtml(targetLabel)}</span></div>
      ${hoverLabel}
      <div class="kv"><span class="k">Modo</span><span class="v">${modeLabel}</span></div>
      <div class="kv"><span class="k">Distância até você</span><span class="v">${distance.toFixed(1)} u</span></div>
      <div class="kv"><span class="k">Sistema</span><span class="v">${escapeHtml(star.name)} (${star.planets.length} pl.)</span></div>
      ${extraParts.join('')}
      <div class="section">Planetas do sistema (mire/clique ou ,/. J/K)</div>
      <ul class="planets">${planets}</ul>
      <div class="section">GUIDE (estrela)</div>
      ${guideHtml}`
  }

  const keys = new Set<string>()
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space') e.preventDefault()
    if (e.repeat) {
      keys.add(e.code)
      return
    }
    keys.add(e.code)

    // input manual cancela viagem automática
    if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'KeyC', 'ShiftLeft'].includes(e.code)) autopilot = null

    if (e.code === 'KeyF') {
      autopilot = null
      setTarget({ kind: 'star', starIndex: nearestStar().index }, true)
    } else if (e.code === 'KeyG') {
      e.preventDefault()
      if (autopilot) {
        autopilot = null
      } else {
        const t = currentTarget()
        if (!pinned) setTarget(t, true, false)
        autopilot = { target: currentTarget() }
      }
    } else if (e.code === 'KeyX' || e.code === 'Escape') {
      // X ou ESC: solta/desafixa alvo e cancela viagem (ESC também libera o mouse pelo navegador)
      unpinTarget()
      return
    } else if (e.code === 'BracketLeft' || e.key === '[') {
      e.preventDefault()
      autopilot = null
      cycleStar(-1) // [ = estrela anterior (fixa e navega)
    } else if (e.code === 'BracketRight' || e.key === ']') {
      e.preventDefault()
      autopilot = null
      goBackSelection() // ] = voltar seleção anterior (histórico)
    } else if (e.code === 'KeyN') {
      autopilot = null
      cycleStar(1) // próxima estrela
    } else if (e.code === 'KeyP') {
      autopilot = null
      cycleStar(-1) // estrela anterior
    } else if (e.code === 'Backspace') {
      e.preventDefault()
      autopilot = null
      goBackSelection() // voltar histórico; se vazio, desafixa
    } else if (e.code === 'Comma' || e.code === 'KeyJ' || e.key === ',') {
      e.preventDefault()
      autopilot = null
      cyclePlanet(-1)
    } else if (e.code === 'Period' || e.code === 'KeyK' || e.key === '.') {
      e.preventDefault()
      autopilot = null
      cyclePlanet(1)
    } else if (e.code === 'Enter') {
      autopilot = null
      const cur = currentTarget()
      setTarget({ kind: 'star', starIndex: cur.starIndex }, true)
    }
  })
  window.addEventListener('keyup', (e) => keys.delete(e.code))
  canvas.addEventListener('click', () => {
    if (document.pointerLockElement !== canvas) {
      canvas.requestPointerLock()
      return
    }
    // mouse capturado: clique seleciona objeto sob a mira (crosshair)
    const picked = pickAtNdc(0, 0)
    if (picked) setTarget(picked, true)
  })
  canvas.addEventListener('mousemove', (e) => {
    if (document.pointerLockElement === canvas) {
      mouseNdc = null
      hovered = null
      return
    }
    const rect = canvas.getBoundingClientRect()
    const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1
    const ny = -(((e.clientY - rect.top) / rect.height) * 2 - 1)
    mouseNdc = { x: nx, y: ny }
  })
  canvas.addEventListener('mouseleave', () => {
    if (document.pointerLockElement !== canvas) mouseNdc = null
  })
  window.addEventListener('mousemove', (e) => {
    if (document.pointerLockElement !== canvas) return
    yaw -= e.movementX * 0.0025
    pitch -= e.movementY * 0.0025
    pitch = Math.max(-1.5, Math.min(1.5, pitch))
  })
  document.addEventListener('pointerlockchange', () => {
    if (document.pointerLockElement === canvas) {
      mouseNdc = null
    } else {
      hovered = null
    }
  })

  function resize(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = Math.floor(window.innerWidth * dpr)
    canvas.height = Math.floor(window.innerHeight * dpr)
    canvas.style.width = `${window.innerWidth}px`
    canvas.style.height = `${window.innerHeight}px`
  }
  window.addEventListener('resize', resize)
  resize()

  const view = new Float32Array(16)
  const proj = new Float32Array(16)
  let last = performance.now()
  let hudClock = 0

  function projectToNdc(wx: number, wy: number, wz: number): { x: number; y: number; z: number } | null {
    // clip = proj * (view * world)
    const vx = view[0] * wx + view[4] * wy + view[8] * wz + view[12]
    const vy = view[1] * wx + view[5] * wy + view[9] * wz + view[13]
    const vz = view[2] * wx + view[6] * wy + view[10] * wz + view[14]
    const vw = view[3] * wx + view[7] * wy + view[11] * wz + view[15]
    const cx = proj[0] * vx + proj[4] * vy + proj[8] * vz + proj[12] * vw
    const cy = proj[1] * vx + proj[5] * vy + proj[9] * vz + proj[13] * vw
    const cz = proj[2] * vx + proj[6] * vy + proj[10] * vz + proj[14] * vw
    const cw = proj[3] * vx + proj[7] * vy + proj[11] * vz + proj[15] * vw
    if (cw <= 0.0001) return null
    const x = cx / cw
    const y = cy / cw
    const z = cz / cw
    if (z < -1 || z > 1) return null
    return { x, y, z }
  }

  // Pick com prioridade refinada: planetas do sistema atual > estrela-alvo > demais estrelas.
  function pickAtNdc(nx: number, ny: number): Target | null {
    const aspect = canvas.width / Math.max(1, canvas.height)
    const baseR = 0.02
    type PickHit = { t: Target; score: number; depth: number; d2: number }
    const better = (a: PickHit | null, b: PickHit) => !a || b.d2 < a.d2 - 1e-6 || (Math.abs(b.d2 - a.d2) < 1e-6 && b.depth < a.depth)

    const tryHit = (wx: number, wy: number, wz: number, t: Target, radius: number): PickHit | null => {
      const ndc = projectToNdc(wx, wy, wz)
      if (!ndc) return null
      const rx = radius
      const ry = radius * aspect
      if (Math.abs(ndc.x - nx) <= rx && Math.abs(ndc.y - ny) <= ry) {
        const d2 = ((ndc.x - nx) / rx) ** 2 + ((ndc.y - ny) / ry) ** 2
        return { t, score: d2 + ndc.z * 0.001, depth: ndc.z, d2 }
      }
      return null
    }

    // 1) Planetas do sistema atual (prioridade local, evita "estrela engolir planeta")
    const sys = currentTarget().starIndex
    const starSys = galaxy.stars[sys]
    let bestPlanet: PickHit | null = null
    for (let i = 0; i < starSys.planets.length; i++) {
      const pl = starSys.planets[i]
      const [px, py, pz] = planetRenderPos(sys, i)
      const vis = planetVisualFromCatalog(pl.planetType, pl.id, pl.slot)
      const dist = Math.hypot(px - eye[0], py - eye[1], pz - eye[2])
      const r = Math.max(baseR, Math.min(0.14, (vis.disk * 0.013) / Math.max(dist, 0.8)))
      const hit = tryHit(px, py, pz, { kind: 'planet', starIndex: sys, planetIndex: i }, r)
      if (hit && better(bestPlanet, hit)) bestPlanet = hit
    }
    if (bestPlanet) return bestPlanet.t

    // 2) Estrela do sistema atual
    {
      const [sx, sy, sz] = starPos(sys)
      const dist = Math.hypot(sx - eye[0], sy - eye[1], sz - eye[2])
      const szStar = starSize(starSys)
      const r = Math.max(baseR, Math.min(0.1, (szStar * 0.012) / Math.max(dist, 1)))
      const hit = tryHit(sx, sy, sz, { kind: 'star', starIndex: sys }, r)
      if (hit) return hit.t
    }

    // 3) Demais estrelas (amostragem por proximidade não necessária para 72k no desktop alvo? custo ok por frame de hover raro; mas hover roda toda frame -> filtrar por distância grosseira)
    let bestStar: PickHit | null = null
    for (let i = 0; i < galaxy.stars.length; i++) {
      const [sx, sy, sz] = starPos(i)
      const dx = sx - eye[0], dy = sy - eye[1], dz = sz - eye[2]
      const dist2 = dx * dx + dy * dy + dz * dz
      if (dist2 > 9000000) continue // ~3000u raio de interesse para hover/pick
      const dist = Math.sqrt(dist2)
      const s = galaxy.stars[i]
      const szStar = starSize(s)
      const r = Math.max(baseR * 0.8, Math.min(0.08, (szStar * 0.01) / Math.max(dist, 1)))
      const hit = tryHit(sx, sy, sz, { kind: 'star', starIndex: i }, r)
      if (hit && better(bestStar, hit)) bestStar = hit
    }
    return bestStar ? bestStar.t : null
  }

  function pushOverlay(x: number, y: number, z: number, size: number, r: number, g: number, b: number, idx: number): number {
    if (idx >= overlay.length / 7) return idx
    const base = idx * 7
    overlay[base] = x
    overlay[base + 1] = y
    overlay[base + 2] = z
    overlay[base + 3] = size
    overlay[base + 4] = r
    overlay[base + 5] = g
    overlay[base + 6] = b
    return idx + 1
  }

  function planetOrbitDist(starIndex: number, planetIndex: number): number {
    const sp = starPos(starIndex)
    const [px, py, pz] = planetRenderPos(starIndex, planetIndex)
    return Math.hypot(px - sp[0], py - sp[1], pz - sp[2])
  }

  function sameTarget(a: Target | null, b: Target | null): boolean {
    if (!a || !b) return false
    if (a.kind !== b.kind || a.starIndex !== b.starIndex) return false
    return a.kind === 'star' ? true : (a as any).planetIndex === (b as any).planetIndex
  }

  // Render: estrela do sistema, planetas com "disco" + núcleo (catálogo por tipo), hover e alvo
  function buildOverlays(): number {
    const t = currentTarget()
    const star = galaxy.stars[t.starIndex]
    let n = 0
    // estrela do sistema atual
    const starC = starColor(star)
    const starSz = Math.max(4.0, starSize(star) * 2.6)
    {
      const sp = starPos(t.starIndex)
      n = pushOverlay(sp[0], sp[1], sp[2], starSz, starC[0], starC[1], starC[2], n)
    }
    // planetas do sistema atual
    for (let i = 0; i < star.planets.length; i++) {
      const pl = star.planets[i]
      const [px, py, pz] = planetRenderPos(t.starIndex, i)
      const isSel = t.kind === 'planet' && t.planetIndex === i
      const isHover = !!hovered && hovered.kind === 'planet' && hovered.starIndex === t.starIndex && hovered.planetIndex === i
      const vis = planetVisualFromCatalog(pl.planetType, pl.id, pl.slot)
      // disco suave (halo) para dar aparência de corpo/disco
      const diskCol: [number, number, number] = [
        vis.color[0] * 0.45 + 0.05,
        vis.color[1] * 0.45 + 0.05,
        vis.color[2] * 0.45 + 0.05,
      ]
      n = pushOverlay(px, py, pz, vis.disk * (isSel ? 1.25 : 1.0), diskCol[0], diskCol[1], diskCol[2], n)
      // núcleo colorido por tipo (catálogo)
      let col: [number, number, number] = vis.color
      let sz = vis.size
      if (isSel) { col = [1.0, 0.95, 0.35]; sz = Math.max(vis.size + 2.5, 6.5) }
      n = pushOverlay(px, py, pz, sz, col[0], col[1], col[2], n)
      // destaque de hover (anel/brilho branco) sem confundir com seleção
      if (isHover && !isSel) {
        n = pushOverlay(px, py, pz, vis.disk * 1.45, 0.95, 0.98, 1.0, n)
      }
    }
    // marcador do alvo (e hover se for estrela fora de seleção)
    const [tx, ty, tz] = targetPos(t)
    const tcol: [number, number, number] = t.kind === 'planet' ? [1.0, 0.92, 0.3] : [0.85, 0.95, 1.0]
    const tsz = t.kind === 'planet' ? 10.0 : 7.5
    n = pushOverlay(tx, ty, tz, tsz, tcol[0], tcol[1], tcol[2], n)
    if (hovered && !sameTarget(hovered, t)) {
      const [hx, hy, hz] = targetPos(hovered)
      if (hovered.kind === 'star') {
        n = pushOverlay(hx, hy, hz, 6.5, 0.9, 0.97, 1.0, n)
      }
    }
    return n
  }

  function updateHud(): void {
    const t = currentTarget()
    const star = galaxy.stars[t.starIndex]
    const dist = distanceToTarget(t)
    const guide = galaxy.guide.get(star.idKey)
    const targetLabel = targetLabelOf(t)
    const mode = autopilot ? 'VIAGEM AUTOMÁTICA (G cancela)' : (pinned ? 'ALVO FIXADO' : 'alvo: mais próximo (auto)')
    const lockHint = document.pointerLockElement === canvas
      ? 'Mouse capturado — mire a cruz e CLIQUE para selecionar (ESC libera mouse)'
      : 'Mova o mouse para hover e CLIQUE para capturar/olhar; seleção sob a mira quando capturado'
    const hoverHint = hovered ? ` | sob mira: ${targetLabelOf(hovered)}` : ''
    const targetInfo = t.kind === 'planet'
      ? `T${star.planets[t.planetIndex].planetType} ${(PLANET_TYPES[star.planets[t.planetIndex].planetType]?.description || '').slice(0, 48)}`
      : `S${star.starClass} ${(STAR_CLASSES[star.starClass]?.description || '').slice(0, 48)}`
    const lines = [
      `NOCTIS ENGINE  ·  ${galaxy.stats.starCount} estrelas  ·  ${galaxy.stats.planetCount} planetas  ·  ${lockHint}`,
      'Mira/hover: planetas do sistema com cor/tamanho/disco por tipo (catálogo) · G viagem automática (toggle, encara alvo) · WASD/Shift/Space/C mover',
      'F fixar estrela próxima · X/ESC soltar · [ / P ant. · N próx. · ] ou Backspace voltar · ,/. J/K planeta · Enter estrela',
      `${mode}: ${targetLabel}  (${dist.toFixed(0)} u)  ·  ${targetInfo}${hoverHint}`,
    ]
    if (guide) lines.push(`"${guide.slice(0, 130)}${guide.length > 130 ? '…' : ''}"`)
    hud.textContent = lines.join('\n')
    updatePanel(t, dist)
  }

  function frame(now: number): void {
    const dt = Math.min((now - last) / 1000, 0.1)
    last = now

    if (autopilot) {
      const t = autopilot.target
      const [tx, ty, tz] = targetPos(t)
      const dx = tx - eye[0]
      const dy = ty - eye[1]
      const dz = tz - eye[2]
      const dist = Math.hypot(dx, dy, dz) || 1
      const stop = autopilotStopDist(t)
      // gira suavemente para encarar o alvo (chega "de frente")
      const desiredYaw = Math.atan2(dx, dz)
      const desiredPitch = Math.asin(Math.max(-1, Math.min(1, dy / dist)))
      const rotT = 1 - Math.exp(-3.0 * dt)
      yaw = lerpAngle(yaw, desiredYaw, rotT)
      pitch = lerpAngle(pitch, desiredPitch, rotT)
      pitch = Math.max(-1.5, Math.min(1.5, pitch))
      if (dist > stop) {
        const dirx = dx / dist, diry = dy / dist, dirz = dz / dist
        const speed = Math.max(55, dist * 2.1)
        const step = Math.min(dist - stop, speed * dt)
        eye[0] += dirx * step
        eye[1] += diry * step
        eye[2] += dirz * step
      } else {
        autopilot = null
      }
    }

    const cosP = Math.cos(pitch)
    const dir = { x: Math.sin(yaw) * cosP, y: Math.sin(pitch), z: Math.cos(yaw) * cosP }
    const right = normalize(dir.z, 0, -dir.x)

    const speed = (keys.has('ShiftLeft') ? 260 : 80) * dt
    if (keys.has('KeyW')) {
      eye[0] += dir.x * speed
      eye[1] += dir.y * speed
      eye[2] += dir.z * speed
    }
    if (keys.has('KeyS')) {
      eye[0] -= dir.x * speed
      eye[1] -= dir.y * speed
      eye[2] -= dir.z * speed
    }
    if (keys.has('KeyD')) {
      eye[0] += right.x * speed
      eye[2] += right.z * speed
    }
    if (keys.has('KeyA')) {
      eye[0] -= right.x * speed
      eye[2] -= right.z * speed
    }
    if (keys.has('Space')) eye[1] += speed
    if (keys.has('KeyC')) eye[1] -= speed

    const aspect = canvas.width / Math.max(1, canvas.height)
    perspective(proj, Math.PI / 3, aspect, 0.5, 8000)
    lookAt(view, eye, [eye[0] + dir.x, eye[1] + dir.y, eye[2] + dir.z], [0, 1, 0])
    // hover: crosshair quando pointer lock, senão posição do mouse
    const aim = document.pointerLockElement === canvas ? { x: 0, y: 0 } : mouseNdc
    hovered = aim ? pickAtNdc(aim.x, aim.y) : null
    const overlayCount = buildOverlays()
    starfield.draw(view, proj, 260, overlay, overlayCount)

    hudClock += dt
    if (hudClock > 0.15) {
      hudClock = 0
      updateHud()
    }
    requestAnimationFrame(frame)
  }
  requestAnimationFrame(frame)
}

main().catch((err) => {
  const hud = document.querySelector<HTMLDivElement>('#hud')
  if (hud) hud.textContent = `Erro: ${String(err)}`
  console.error(err)
})
