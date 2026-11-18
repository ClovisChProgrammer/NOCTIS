import './style.css'
import { parseGuide, parseStarmap } from './galaxy/parse.ts'
import { buildGalaxy } from './galaxy/build.ts'
import { lookAt, perspective } from './render/math.ts'
import { createStarfield } from './render/starfield.ts'
import { createBodiesRenderer } from './render/bodies.ts'
import type { BodyInstance } from './render/bodies.ts'
import { createGlobeRenderer } from './render/globe.ts'
import type { GlobeInstance } from './render/globe.ts'
import { createSurfaceRenderer, terrainHeightAt } from './render/surface.ts'
import { createLifeRenderer } from './render/life.ts'
import type { LifeItem } from './render/life.ts'
import { createShipRenderer } from './render/ship.ts'
import { createPlanetAtlas } from './render/textures.ts'
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
    <div id="cockpit"></div>
    <div id="reticle"></div>
    <div id="hud"></div>
    <div id="console">
      <div class="con-block"><div class="con-l">MODO</div><div class="con-v" id="con-mode">AUTO</div></div>
      <div class="con-block"><div class="con-l">VELOCIDADE</div><div class="con-v" id="con-speed">0 u/s</div></div>
      <div class="con-mid"><canvas id="con-compass" width="360" height="44"></canvas></div>
      <div class="con-block"><div class="con-l">ALVO</div><div class="con-v" id="con-target">-</div><div class="con-s" id="con-dist"></div></div>
      <div class="con-block"><div class="con-l">POSICAO</div><div class="con-s" id="con-pos">0 0 0</div></div>
    </div>
    <aside id="panel">
      <div class="pc-head">
        <span class="pc-title">COMPUTADOR DE BORDO</span>
        <span class="pc-sys">NC-IV</span>
      </div>
      <nav class="pc-tabs">
        <button data-tab="target" class="active">1 ALVO</button>
        <button data-tab="system">2 SISTEMA</button>
        <button data-tab="map">3 MAPA</button>
        <button data-tab="status">4 STATUS</button>
        <button data-tab="search">5 BUSCA</button>
      </nav>
      <div id="panel-body"></div>
      <div class="pc-foot">I fecha &middot; V nave &middot; 1-5/Tab abas &middot; clique num alvo para fixar</div>
    </aside>`
  const canvas = document.querySelector<HTMLCanvasElement>('#view')!
  const hud = document.querySelector<HTMLDivElement>('#hud')!
  const panel = document.querySelector<HTMLElement>('#panel')!
  const cockpit = document.querySelector<HTMLDivElement>('#cockpit')!
  const panelBody = document.querySelector<HTMLDivElement>('#panel-body')!
  const consoleMode = document.querySelector<HTMLDivElement>('#con-mode')!
  const consoleSpeed = document.querySelector<HTMLDivElement>('#con-speed')!
  const consoleTarget = document.querySelector<HTMLDivElement>('#con-target')!
  const consoleDist = document.querySelector<HTMLDivElement>('#con-dist')!
  const consolePos = document.querySelector<HTMLDivElement>('#con-pos')!
  const compass = document.querySelector<HTMLCanvasElement>('#con-compass')!
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
  const atlas = createPlanetAtlas(gl)
  const bodies = createBodiesRenderer(gl, atlas.texture)
  const globes = createGlobeRenderer(gl)
  const surface = createSurfaceRenderer(gl)
  const life = createLifeRenderer(gl)
  const ship = createShipRenderer(gl)
  const overlay = new Float32Array(2048 * 7) // markers/rings only (bodies renderizados via texturas)

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

  type LandingState = {
    starIndex: number
    planetIndex: number
    savedEye: [number, number, number]
    savedYaw: number
    savedPitch: number
    groundY: number
    seed: number
    spawnX: number
    spawnY: number
    spawnZ: number
  }
  let landing: LandingState | null = null
  let walkPhase = 0
  let externalView = false
  let externalBlend = 0

  function applyCockpitVisibility(): void {
    cockpit.classList.toggle('hidden', landing !== null || externalView)
  }

  type Plant = { x: number; y: number; z: number; w: number; h: number; seed: number; r: number; g: number; b: number; kind: number; alive: boolean }
  type Creature = { x: number; z: number; y: number; dirX: number; dirZ: number; speed: number; seed: number; seen: boolean; timer: number }
  let flora: Plant[] = []
  let fauna: Creature[] = []
  let floraCollected = 0
  let faunaObserved = 0
  let lifeMsg = ''
  let lifeMsgT = 0

  if (import.meta.env.DEV) {
    ;(window as unknown as { __noctis?: unknown }).__noctis = {
      state: () => ({ eye: [eye[0], eye[1], eye[2]], yaw, pitch, externalView, externalBlend, landing: landing ? { ...landing } : null, surface: landing ? surfacePalette(landing.starIndex, landing.planetIndex) : null }),
      terrainHeightAt,
    }
  }

  function mulberry32(a: number): () => number {
    let s = a >>> 0
    return () => {
      s = (s + 0x6d2b79f5) | 0
      let t = Math.imul(s ^ (s >>> 15), 1 | s)
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
  }

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
      // para em frente ao planeta texturizado (distância proporcional ao tamanho visual em world units)
      // mantem a camera FORA do billboard (evita visao "travada" em planetas very large)
      let d = Math.max(4, vis.size * 0.5 + 3)
      for (let i = 0; i < 6; i++) {
        const s = bodyWorldSize(vis.size, d, true)
        const need = s * 1.8 + 2.0
        if (d >= need) break
        d = need + 2
      }
      return d
    }
    const star = galaxy.stars[t.starIndex]
    const base = Math.max(3.5, starSize(star) * 2.1)
    let d = 16
    for (let i = 0; i < 6; i++) {
      const s = bodyWorldSize(base, d, false)
      const need = s * 1.45 + 3.0
      if (d >= need) break
      d = need + 2
    }
    return d
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

  type TabId = 'target' | 'system' | 'map' | 'status' | 'search'
  const TAB_ORDER: TabId[] = ['target', 'system', 'map', 'status', 'search']
  let activeTab: TabId = 'target'
  let panelSig = ''
  let shipSpeed = 0
  let mapView = { scale: 1, cx: 0, cy: 0, starIndex: 0 }
  let searchText = ''
  type SearchHit = { target: Target; label: string; sub: string }
  let searchHits: SearchHit[] = []

  function setTab(tab: TabId): void {
    activeTab = tab
    panel.classList.remove('hidden')
    for (const b of panel.querySelectorAll<HTMLElement>('[data-tab]')) {
      b.classList.toggle('active', b.dataset.tab === tab)
    }
    panelSig = ''
    updateHud()
  }

  function panelSignature(t: Target): string {
    return `${activeTab}|${t.kind}|${t.starIndex}|${t.kind === 'planet' ? t.planetIndex : -1}|${galaxy.stars[t.starIndex].planets.length}`
  }

  function headingDeg(): number {
    return (((yaw * 180) / Math.PI) % 360 + 360) % 360
  }

  function cardinal(deg: number): string {
    return ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(deg / 45) % 8]
  }

  function setLive(name: string, text: string): void {
    for (const el of panelBody.querySelectorAll<HTMLElement>(`[data-live="${name}"]`)) el.textContent = text
  }

  function foldText(s: string): string {
    return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase()
  }

  function runSearch(): void {
    const q = foldText(searchText.trim())
    if (q.length < 2) {
      searchHits = []
      return
    }
    const numeric = /^\d+$/.test(q)
    const found: Array<SearchHit & { rank: number }> = []
    for (let i = 0; i < galaxy.stars.length && found.length < 400; i++) {
      const s = galaxy.stars[i]
      const name = foldText(s.name)
      const nr = name.startsWith(q) ? 0 : name.includes(q) ? 2 : -1
      const idr = numeric && String(s.id).startsWith(q) ? 1 : -1
      const kr = foldText(s.idKey).includes(q) ? 7 : -1
      const rank = Math.min(nr < 0 ? 99 : nr, idr < 0 ? 99 : idr, kr < 0 ? 99 : kr)
      if (rank < 90) {
        found.push({ rank, target: { kind: 'star', starIndex: i }, label: s.name, sub: `ESTRELA · S${s.starClass} · ID ${s.idKey} · ${s.planets.length} planetas` })
      }
      for (let j = 0; j < s.planets.length && found.length < 400; j++) {
        const p = s.planets[j]
        const pn = foldText(p.name)
        const pnr = pn.startsWith(q) ? 3 : pn.includes(q) ? 5 : -1
        const pir = numeric && String(p.id) === q ? 4 : numeric && String(p.id).startsWith(q) ? 6 : -1
        const pkr = foldText(p.idKey).includes(q) ? 8 : -1
        const pr = Math.min(pnr < 0 ? 99 : pnr, pir < 0 ? 99 : pir, pkr < 0 ? 99 : pkr)
        if (pr < 90) {
          found.push({ rank: pr, target: { kind: 'planet', starIndex: i, planetIndex: j }, label: p.name, sub: `PLANETA · T${p.planetType} · ${s.name} · ID ${p.idKey}` })
        }
      }
    }
    found.sort((a, b) => a.rank - b.rank || a.label.length - b.label.length || a.label.localeCompare(b.label))
    searchHits = found.slice(0, 60).map(({ target, label, sub }) => ({ target, label, sub }))
  }

  function renderSearchResults(): void {
    const box = document.querySelector<HTMLDivElement>('#search-results')
    if (!box) return
    const count = document.querySelector<HTMLElement>('#search-count')
    if (count) {
      count.textContent = searchText.trim().length < 2
        ? 'Digite ao menos 2 caracteres (nome ou id).'
        : `${searchHits.length} resultado(s) · clique para fixar`
    }
    box.innerHTML = searchHits
      .map((h) => {
        const c = h.target.kind === 'star'
          ? starColor(galaxy.stars[h.target.starIndex])
          : planetVisualFromCatalog(
              galaxy.stars[h.target.starIndex].planets[h.target.planetIndex].planetType,
              galaxy.stars[h.target.starIndex].planets[h.target.planetIndex].id,
              galaxy.stars[h.target.starIndex].planets[h.target.planetIndex].slot,
            ).color
        const rgb = `rgb(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)})`
        return `<button class="prow${h.target.kind === 'star' ? ' star' : ''}" data-act="search-hit" data-s="${h.target.starIndex}" data-p="${h.target.kind === 'planet' ? h.target.planetIndex : -1}">
          <span class="dot" style="background:${rgb}"></span>
          <span class="pname">${escapeHtml(h.label)}</span>
          <span class="pm">${h.target.kind === 'star' ? 'ESTRELA' : 'PLANETA'}</span>
          <span class="ptype">${escapeHtml(h.sub)}</span>
        </button>`
      })
      .join('')
  }

  function renderTab(t: Target): void {
    const star = galaxy.stars[t.starIndex]
    const sc = STAR_CLASSES[star.starClass] ?? STAR_CLASSES[0]
    const guide = galaxy.guide.get(star.idKey)

    if (activeTab === 'target') {
      const extra: string[] = []
      if (t.kind === 'planet') {
        const pl = star.planets[t.planetIndex]
        const ptype = PLANET_TYPES[pl.planetType] ?? PLANET_TYPES[1]
        extra.push(`<div class="kv"><span class="k">Tipo</span><span class="v">T${pl.planetType}</span></div>`)
        extra.push(`<div class="kv"><span class="k">Orbita</span><span class="v">~${planetOrbitDist(t.starIndex, t.planetIndex).toFixed(0)} u</span></div>`)
        extra.push(`<div class="kv"><span class="k">Planetas</span><span class="v">${star.planets.length}</span></div>`)
        extra.push(`<div class="muted small">${escapeHtml(ptype.description)}</div>`)
      } else {
        extra.push(`<div class="kv"><span class="k">Classe</span><span class="v">S${star.starClass}</span></div>`)
        extra.push(`<div class="kv"><span class="k">Planetas</span><span class="v">${star.planets.length}</span></div>`)
        extra.push(`<div class="muted small">${escapeHtml(sc.description)}</div>`)
      }
      const guideHtml = guide
        ? `<div class="guide">${escapeHtml(guide.length > 260 ? `${guide.slice(0, 260)}...` : guide)}</div>`
        : '<div class="muted small">Sem entrada no GUIDE.</div>'
      panelBody.innerHTML = `
        <div class="kv"><span class="k">Alvo</span><span class="v" data-live="target"></span></div>
        <div class="kv"><span class="k">Modo</span><span class="v" data-live="mode"></span></div>
        <div class="kv"><span class="k">Distancia</span><span class="v" data-live="dist"></span></div>
        <div class="kv"><span class="k">Sob mira</span><span class="v" data-live="hover"></span></div>
        <div class="section">Sistema ${escapeHtml(star.name)}</div>
        ${extra.join('')}
        <div class="section">GUIDE</div>
        ${guideHtml}`
      return
    }

    if (activeTab === 'system') {
      const c = starColor(star)
      const starRgb = `rgb(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)})`
      const rows = star.planets
        .map((p, i) => {
          const vis = planetVisualFromCatalog(p.planetType, p.id, p.slot)
          const prgb = `rgb(${Math.round(vis.color[0] * 255)},${Math.round(vis.color[1] * 255)},${Math.round(vis.color[2] * 255)})`
          const active = t.kind === 'planet' && t.planetIndex === i ? ' active' : ''
          const od = planetOrbitDist(t.starIndex, i).toFixed(0)
          const ptype = PLANET_TYPES[p.planetType] ?? PLANET_TYPES[1]
          return `<button class="prow${active}" data-act="planet" data-i="${i}">
            <span class="dot" style="background:${prgb}"></span>
            <span class="pname">${escapeHtml(p.name)}</span>
            <span class="pm">T${p.planetType} &middot; ${od} u</span>
            <span class="ptype">${escapeHtml(ptype.description)}</span>
          </button>`
        })
        .join('')
      panelBody.innerHTML = `
        <button class="prow star${t.kind === 'star' ? ' active' : ''}" data-act="star">
          <span class="dot" style="background:${starRgb}"></span>
          <span class="pname">${escapeHtml(star.name)}</span>
          <span class="pm">S${star.starClass}</span>
        </button>
        <div class="muted small">${escapeHtml(sc.description)}</div>
        <div class="section">Planetas (${star.planets.length}) &middot; clique para fixar</div>
        ${rows || '<div class="muted small">Nenhum planeta registrado.</div>'}
        <div class="section">GUIDE</div>
        ${guide ? `<div class="guide">${escapeHtml(guide)}</div>` : '<div class="muted small">Sem entrada no GUIDE.</div>'}`
      return
    }

    if (activeTab === 'map') {
      panelBody.innerHTML = `
        <canvas id="sysmap" width="600" height="440"></canvas>
        <div class="muted small">Clique num planeta para fixar. Anel = orbita visual &middot; seta = nave &middot; anel amarelo = alvo.</div>`
      return
    }

    if (activeTab === 'search') {
      panelBody.innerHTML = `
        <div class="search-box"><input id="search-input" type="text" autocomplete="off" spellcheck="false" placeholder="NOME OU ID HEX/DEC (min. 2)" value="${escapeHtml(searchText)}" /></div>
        <div class="muted small" id="search-count"></div>
        <div class="section">Indice (${galaxy.stats.starCount} estrelas &middot; ${galaxy.stats.planetCount} planetas)</div>
        <div id="search-results"></div>`
      renderSearchResults()
      return
    }

    panelBody.innerHTML = `
      <div class="kv"><span class="k">Velocidade</span><span class="v" data-live="speed"></span></div>
      <div class="kv"><span class="k">Proa</span><span class="v" data-live="heading"></span></div>
      <div class="kv"><span class="k">Atitude</span><span class="v" data-live="pitch"></span></div>
      <div class="kv"><span class="k">Posicao</span><span class="v" data-live="pos"></span></div>
      <div class="section">Navegacao</div>
      <div class="kv"><span class="k">Sistema</span><span class="v" data-live="system"></span></div>
      <div class="kv"><span class="k">Alvo</span><span class="v" data-live="target"></span></div>
      <div class="kv"><span class="k">Distancia</span><span class="v" data-live="dist"></span></div>
      <div class="kv"><span class="k">Modo</span><span class="v" data-live="mode"></span></div>
      <div class="kv"><span class="k">Mouse</span><span class="v" data-live="mouse"></span></div>
      <div class="section">Teclas</div>
      <div class="muted small">WASD/Shift/Space/C voar &middot; G autopilot &middot; F fixar estrela &middot; X soltar &middot; ,/. ou J/K planetas &middot; Enter estrela &middot; [ ] N historico &middot; I computador &middot; V nave externa &middot; 1-5 abas</div>`
  }

  function drawCompass(): void {
    const ctx = compass.getContext('2d')
    if (!ctx) return
    const w = compass.width
    const h = compass.height
    ctx.clearRect(0, 0, w, h)
    ctx.fillStyle = 'rgba(6,14,30,0.72)'
    ctx.fillRect(0, 0, w, h)
    const cx = w / 2
    const ppd = w / 180
    const hdg = headingDeg()
    ctx.textAlign = 'center'
    ctx.font = '11px monospace'
    for (let d = -90; d <= 90; d += 5) {
      const deg = hdg + d
      const x = cx + d * ppd
      const norm = ((deg % 360) + 360) % 360
      const major = Math.abs(norm % 15) < 0.01 || Math.abs((norm % 15) - 15) < 0.01
      const cardinalIdx = Math.round(norm / 45) % 8
      const isCard = Math.abs(norm - cardinalIdx * 45) < 2.5 || Math.abs(norm - cardinalIdx * 45 - 360) < 2.5
      ctx.strokeStyle = major ? 'rgba(170,205,255,0.85)' : 'rgba(120,160,230,0.32)'
      ctx.beginPath()
      ctx.moveTo(x, h - 6)
      ctx.lineTo(x, h - 6 - (major ? 13 : 6))
      ctx.stroke()
      if (isCard) {
        ctx.fillStyle = 'rgba(225,240,255,0.92)'
        ctx.fillText(['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][cardinalIdx], x, 13)
      }
    }
    const t = currentTarget()
    const [tx, , tz] = targetPos(t)
    let rel = Math.atan2(tx - eye[0], tz - eye[2]) - yaw
    rel = wrapPi(rel) * 180 / Math.PI
    const mx = Math.max(8, Math.min(w - 8, cx + rel * ppd))
    ctx.fillStyle = 'rgba(255,220,110,0.95)'
    ctx.beginPath()
    ctx.moveTo(mx, 24)
    ctx.lineTo(mx - 5, 16)
    ctx.lineTo(mx + 5, 16)
    ctx.closePath()
    ctx.fill()
    ctx.strokeStyle = 'rgba(255,220,110,0.7)'
    ctx.beginPath()
    ctx.moveTo(cx, h - 4)
    ctx.lineTo(cx, h - 22)
    ctx.stroke()
  }

  function drawSysMap(t: Target): void {
    const cv = document.querySelector<HTMLCanvasElement>('#sysmap')
    if (!cv) return
    const ctx = cv.getContext('2d')
    if (!ctx) return
    const w = cv.width
    const h = cv.height
    const sp = starPos(t.starIndex)
    const star = galaxy.stars[t.starIndex]
    let maxOrbit = 1
    for (let i = 0; i < star.planets.length; i++) {
      const [px, , pz] = planetRenderPos(t.starIndex, i)
      maxOrbit = Math.max(maxOrbit, Math.hypot(px - sp[0], pz - sp[2]))
    }
    const sdx = eye[0] - sp[0]
    const sdz = eye[2] - sp[2]
    const shipDist = Math.hypot(sdx, sdz)
    const range = Math.max(maxOrbit, shipDist) * 1.15 + 4
    const scale = (Math.min(w, h) * 0.5 - 14) / range
    const cx = w / 2
    const cy = h / 2
    mapView = { scale, cx, cy, starIndex: t.starIndex }

    ctx.clearRect(0, 0, w, h)
    const bg = ctx.createRadialGradient(cx, cy, 2, cx, cy, Math.min(w, h) * 0.6)
    bg.addColorStop(0, 'rgba(10,22,44,0.85)')
    bg.addColorStop(1, 'rgba(3,7,16,0.92)')
    ctx.fillStyle = bg
    ctx.fillRect(0, 0, w, h)

    ctx.save()
    ctx.translate(cx, cy)

    for (let i = 0; i < star.planets.length; i++) {
      const [px, , pz] = planetRenderPos(t.starIndex, i)
      const r = Math.hypot(px - sp[0], pz - sp[2]) * scale
      ctx.strokeStyle = 'rgba(90,140,255,0.20)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.arc(0, 0, r, 0, Math.PI * 2)
      ctx.stroke()
    }

    const sc = starColor(star)
    ctx.shadowColor = `rgba(${Math.round(sc[0] * 255)},${Math.round(sc[1] * 255)},${Math.round(sc[2] * 255)},0.9)`
    ctx.shadowBlur = 14
    ctx.fillStyle = `rgb(${Math.round(sc[0] * 255)},${Math.round(sc[1] * 255)},${Math.round(sc[2] * 255)})`
    ctx.beginPath()
    ctx.arc(0, 0, 7, 0, Math.PI * 2)
    ctx.fill()
    ctx.shadowBlur = 0

    for (let i = 0; i < star.planets.length; i++) {
      const pl = star.planets[i]
      const [px, , pz] = planetRenderPos(t.starIndex, i)
      const x = (px - sp[0]) * scale
      const y = (pz - sp[2]) * scale
      const vis = planetVisualFromCatalog(pl.planetType, pl.id, pl.slot)
      const rgb = `rgb(${Math.round(vis.color[0] * 255)},${Math.round(vis.color[1] * 255)},${Math.round(vis.color[2] * 255)})`
      const active = t.kind === 'planet' && t.planetIndex === i
      if (active) {
        ctx.strokeStyle = 'rgba(255,220,110,0.5)'
        ctx.setLineDash([4, 4])
        ctx.beginPath()
        ctx.moveTo(sdx * scale, sdz * scale)
        ctx.lineTo(x, y)
        ctx.stroke()
        ctx.setLineDash([])
      }
      ctx.fillStyle = rgb
      ctx.beginPath()
      ctx.arc(x, y, active ? 6 : 4, 0, Math.PI * 2)
      ctx.fill()
      if (active) {
        ctx.strokeStyle = '#fff3a8'
        ctx.lineWidth = 2
        ctx.stroke()
        ctx.font = '12px monospace'
        ctx.textAlign = 'left'
        ctx.fillStyle = '#fff3a8'
        ctx.fillText(pl.name, x + 9, y + 4)
      }
    }

    const sx = sdx * scale
    const sy = sdz * scale
    ctx.save()
    ctx.translate(sx, sy)
    ctx.rotate(Math.PI - yaw)
    ctx.fillStyle = '#7fffd4'
    ctx.beginPath()
    ctx.moveTo(0, -9)
    ctx.lineTo(6, 7)
    ctx.lineTo(0, 4)
    ctx.lineTo(-6, 7)
    ctx.closePath()
    ctx.fill()
    ctx.restore()

    ctx.restore()
    ctx.font = '12px monospace'
    ctx.textAlign = 'left'
    ctx.fillStyle = 'rgba(150,180,225,0.75)'
    ctx.fillText(`${star.name}  ·  raio ${range.toFixed(0)} u`, 10, h - 10)
  }

  function revealActivePanelRow(): void {
    if (panel.classList.contains('hidden')) return
    const active = panel.querySelector<HTMLElement>('.prow.active')
    if (!active) return
    const ar = active.getBoundingClientRect()
    const pr = panel.getBoundingClientRect()
    const pad = 8
    if (ar.top < pr.top + pad) panel.scrollTop -= pr.top + pad - ar.top
    else if (ar.bottom > pr.bottom - pad) panel.scrollTop += ar.bottom - (pr.bottom - pad)
  }

  function updatePanel(t: Target, distance: number): void {
    const sig = panelSignature(t)
    if (sig !== panelSig) {
      panelSig = sig
      renderTab(t)
      revealActivePanelRow()
    }
    const star = galaxy.stars[t.starIndex]
    const modeText = autopilot ? 'VIAGEM' : pinned ? 'FIXO' : 'AUTO'
    setLive('target', targetLabelOf(t))
    setLive('mode', modeText)
    setLive('dist', `${distance.toFixed(1)} u`)
    setLive('hover', hovered ? targetLabelOf(hovered) : '-')
    setLive('speed', `${shipSpeed.toFixed(0)} u/s`)
    const hd = headingDeg()
    setLive('heading', `${hd.toFixed(0)} deg ${cardinal(hd)}`)
    setLive('pitch', `${((pitch * 180) / Math.PI).toFixed(0)} deg`)
    setLive('pos', `${eye[0].toFixed(0)}, ${eye[1].toFixed(0)}, ${eye[2].toFixed(0)}`)
    setLive('system', `${star.name} · ${star.planets.length} planetas`)
    setLive('mouse', document.pointerLockElement === canvas ? 'capturado' : 'livre')
    drawCompass()
    if (activeTab === 'map' && !panel.classList.contains('hidden')) drawSysMap(t)
  }

  panel.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-tab]')
    if (b?.dataset.tab) setTab(b.dataset.tab as TabId)
  })

  panelBody.addEventListener('input', (e) => {
    const el = e.target as HTMLInputElement
    if (el.id !== 'search-input') return
    searchText = el.value
    runSearch()
    renderSearchResults()
  })

  panelBody.addEventListener('click', (e) => {
    const el = e.target as HTMLElement
    if (el.id === 'sysmap') {
      const cv = el as HTMLCanvasElement
      const rect = cv.getBoundingClientRect()
      const x = (e.clientX - rect.left) * (cv.width / Math.max(1, rect.width)) - mapView.cx
      const y = (e.clientY - rect.top) * (cv.height / Math.max(1, rect.height)) - mapView.cy
      const star = galaxy.stars[mapView.starIndex]
      const sp = starPos(mapView.starIndex)
      if (Math.hypot(x, y) < 16) {
        setTarget({ kind: 'star', starIndex: mapView.starIndex }, true)
        autopilot = null
        return
      }
      let best = -1
      let bestD = 18
      for (let i = 0; i < star.planets.length; i++) {
        const [px, , pz] = planetRenderPos(mapView.starIndex, i)
        const d = Math.hypot((px - sp[0]) * mapView.scale - x, (pz - sp[2]) * mapView.scale - y)
        if (d < bestD) {
          bestD = d
          best = i
        }
      }
      if (best >= 0) {
        setTarget({ kind: 'planet', starIndex: mapView.starIndex, planetIndex: best }, true)
        autopilot = null
      }
      return
    }
    const act = el.closest<HTMLElement>('[data-act]')
    if (!act) return
    if (act.dataset.act === 'planet') {
      const i = Number(act.dataset.i)
      setTarget({ kind: 'planet', starIndex: currentTarget().starIndex, planetIndex: i }, true)
      autopilot = null
    } else if (act.dataset.act === 'star') {
      setTarget({ kind: 'star', starIndex: currentTarget().starIndex }, true)
      autopilot = null
    } else if (act.dataset.act === 'search-hit') {
      const si = Number(act.dataset.s)
      const pi = Number(act.dataset.p)
      const hit: Target = pi < 0 ? { kind: 'star', starIndex: si } : { kind: 'planet', starIndex: si, planetIndex: pi }
      autopilot = null
      setTarget(hit, true)
      setTab('target')
    }
  })

  const keys = new Set<string>()
  window.addEventListener('keydown', (e) => {
    const typing = e.target as HTMLElement | null
    if (typing && typing.closest('#panel') && (typing.tagName === 'INPUT' || typing.isContentEditable)) return
    if (e.code === 'Space') e.preventDefault()
    if (e.repeat) {
      keys.add(e.code)
      return
    }
    keys.add(e.code)

    // input manual cancela viagem automática
    if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'KeyC', 'ShiftLeft'].includes(e.code)) autopilot = null

    const walkKeys = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft', 'Space', 'KeyC'])
    if (landing) {
      if (e.code === 'KeyG') {
        exitLanding()
        return
      }
      if (e.code === 'KeyX') {
        exitLanding()
        return
      }
      if (e.code === 'KeyE') {
        interactLanding()
        return
      }
      if (!['KeyI', 'Tab', 'Escape', 'KeyL', 'KeyE', 'KeyV'].includes(e.code) && !e.code.startsWith('Digit') && !walkKeys.has(e.code)) return
    }

    if (e.code === 'KeyL') {
      if (landing) {
        exitLanding()
      } else {
        const t = currentTarget()
        if (canLand(t)) enterLanding(t)
      }
    } else if (e.code === 'KeyF') {
      autopilot = null
      setTarget({ kind: 'star', starIndex: nearestStar().index }, true)
    } else if (e.code === 'KeyG') {
      e.preventDefault()
    if (autopilot && !landing) {
        autopilot = null
      } else {
        const t = currentTarget()
        if (!pinned) setTarget(t, true, false)
        autopilot = { target: currentTarget() }
      }
    } else if (e.code === 'KeyI') {
      e.preventDefault()
      panel.classList.toggle('hidden')
    } else if (e.code === 'KeyV') {
      externalView = !externalView
      applyCockpitVisibility()
    } else if (e.code === 'Tab') {
      e.preventDefault()
      const idx = TAB_ORDER.indexOf(activeTab)
      setTab(TAB_ORDER[(idx + 1) % TAB_ORDER.length])
    } else if (e.code.startsWith('Digit')) {
      const n = Number(e.code.slice(5))
      if (n >= 1 && n <= TAB_ORDER.length) setTab(TAB_ORDER[n - 1])
    } else if (e.code === 'KeyX') {
      // X: solta o alvo (planeta -> estrela do sistema; estrela -> automatico)
      autopilot = null
      if (pinned && selected && selected.kind === 'planet') {
        // mantem o sistema visivel em vez de "sumir tudo"
        setTarget({ kind: 'star', starIndex: selected.starIndex }, true)
      } else {
        unpinTarget()
      }
      return
    } else if (e.code === 'Escape') {
      // ESC: apenas cancela a viagem (browser libera o mouse/pointer lock)
      autopilot = null
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
    if (landing) return
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
  panel.addEventListener('mouseenter', () => {
    // ao interagir com o painel (scroll/clique), suspende hover do jogo
    if (document.pointerLockElement !== canvas) {
      mouseNdc = null
      hovered = null
    }
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
      const worldR = bodyWorldSize(vis.size, dist, false) // raio real do billboard texturizado (world units)
      const ndcY = (worldR / Math.max(dist, 0.8)) / Math.tan(Math.PI / 6)
      const r = Math.max(baseR, Math.min(0.9, ndcY / aspect))
      const hit = tryHit(px, py, pz, { kind: 'planet', starIndex: sys, planetIndex: i }, r)
      if (hit && better(bestPlanet, hit)) bestPlanet = hit
    }
    if (bestPlanet) return bestPlanet.t

    // 2) Estrela do sistema atual
    {
      const [sx, sy, sz] = starPos(sys)
      const dist = Math.hypot(sx - eye[0], sy - eye[1], sz - eye[2])
      const szStar = Math.max(1.2, starSize(starSys) * 1.6)
      const worldR = szStar * 0.35
      const r = Math.max(baseR, Math.min(0.12, worldR / Math.max(dist, 1)))
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

  function bodyWorldSize(base: number, dist: number, selected: boolean): number {
    const nearBoost = selected ? 1.2 : 1.0
    const s = base * (0.17 + 0.23 * Math.min(1, 90 / Math.max(dist, 1))) * nearBoost
    return Math.max(0.3, Math.min(20, s))
  }

  function planetRadiusWorld(starIndex: number, planetIndex: number): number {
    const pl = galaxy.stars[starIndex].planets[planetIndex]
    const vis = planetVisualFromCatalog(pl.planetType, pl.id, pl.slot)
    return bodyWorldSize(vis.size, 1, false)
  }

  function canLand(t: Target): boolean {
    if (t.kind !== 'planet') return false
    const [px, py, pz] = planetRenderPos(t.starIndex, t.planetIndex)
    const dist = Math.hypot(px - eye[0], py - eye[1], pz - eye[2])
    return dist <= planetRadiusWorld(t.starIndex, t.planetIndex) * 2.4 + 8
  }

  // Sonda o terreno à frente/lados para erguer o olho antes que uma encosta
  // entre no near plane (evita o terreno "cortar" a tela ao subir dunas).
  function surfaceClearanceH(x: number, z: number, seed: number, fx: number, fz: number): number {
    const base = terrainHeightAt(x, z, seed)
    const probes: [number, number][] = [
      [0.8, 0], [-0.8, 0], [0, 0.8], [0, -0.8],
      [0.6, 0.6], [0.6, -0.6], [-0.6, 0.6], [-0.6, -0.6],
      [fx * 1.9, fz * 1.9],
    ]
    let hmax = base
    for (const [dx, dz] of probes) {
      const h = terrainHeightAt(x + dx, z + dz, seed)
      if (h > hmax) hmax = h
    }
    return Math.min(hmax, base + 2.4)
  }

  function enterLanding(t: Target): void {
    if (t.kind !== 'planet' || landing) return
    const [px, py, pz] = planetRenderPos(t.starIndex, t.planetIndex)
    const r = planetRadiusWorld(t.starIndex, t.planetIndex)
    const groundY = py - r
    const pl = galaxy.stars[t.starIndex].planets[t.planetIndex]
    const seed = ((pl.id % 512) + 1) / 13.7
    landing = {
      starIndex: t.starIndex,
      planetIndex: t.planetIndex,
      savedEye: [eye[0], eye[1], eye[2]],
      savedYaw: yaw,
      savedPitch: pitch,
      groundY,
      seed,
      spawnX: 0,
      spawnY: 0,
      spawnZ: 0,
    }
    const sp = starPos(t.starIndex)
    const sx = sp[0] - px
    const sz = sp[2] - pz
    const sl = Math.hypot(sx, sz) || 1
    const landX = px + (sx / sl) * r * 0.25
    const landZ = pz + (sz / sl) * r * 0.25
    const shipY = groundY + terrainHeightAt(landX, landZ, seed)
    const lookX = -sx / sl
    const lookZ = -sz / sl
    eye[0] = landX - (sx / sl) * 40
    eye[2] = landZ - (sz / sl) * 40
    eye[1] = groundY + surfaceClearanceH(eye[0], eye[2], seed, lookX, lookZ) + 2.2
    landing.spawnX = landX
    landing.spawnY = shipY
    landing.spawnZ = landZ
    walkPhase = 0
    yaw = Math.atan2(-sx, -sz)
    pitch = 0.04
    applyCockpitVisibility()
    autopilot = null
    keys.clear()

    flora = []
    fauna = []
    floraCollected = 0
    faunaObserved = 0
    lifeMsg = ''
    lifeMsgT = 0
    if (pl.planetType === 3) {
      const rand = mulberry32((pl.id * 2654435761 + pl.slot * 97) >>> 0)
      const fwdX = Math.sin(yaw)
      const fwdZ = Math.cos(yaw)
      const addPlant = (x: number, z: number, forcedKind?: number): void => {
        let kind = forcedKind
        if (kind === undefined) {
          const r = rand()
          kind = r < 0.18 ? 2 : r < 0.34 ? 3 : 0
        }
        let w = 1.2 + rand() * 1.6
        let h = 2.4 + rand() * 2.6
        let r = 0.10 + rand() * 0.14
        let g = 0.42 + rand() * 0.30
        let b = 0.10 + rand() * 0.10
        if (kind === 2) {
          w = 0.8 + rand() * 1.0
          h = 3.0 + rand() * 2.6
          r = 0.04 + rand() * 0.06
          g = 0.24 + rand() * 0.14
          b = 0.06 + rand() * 0.08
        } else if (kind === 3) {
          w = 1.0 + rand() * 1.0
          h = 0.8 + rand() * 0.9
          r = 0.12 + rand() * 0.10
          g = 0.34 + rand() * 0.14
          b = 0.06 + rand() * 0.08
        } else if (kind === 4) {
          w = 0.35 + rand() * 0.45
          h = 0.35 + rand() * 0.55
          r = 0.12 + rand() * 0.13
          g = 0.48 + rand() * 0.17
          b = 0.06 + rand() * 0.10
        }
        flora.push({
          x,
          y: groundY + terrainHeightAt(x, z, seed),
          z,
          w,
          h,
          seed: rand(),
          r,
          g,
          b,
          kind,
          alive: true,
        })
      }
      for (let c = 0; c < 28; c++) {
        const cr = Math.sqrt(rand()) * 280
        const ca = rand() * Math.PI * 2
        const cx = eye[0] + Math.cos(ca) * cr
        const cz = eye[2] + Math.sin(ca) * cr
        const n = 4 + Math.floor(rand() * 7)
        for (let j = 0; j < n; j++) {
          const rr = rand() * 14
          const aa = rand() * Math.PI * 2
          addPlant(cx + Math.cos(aa) * rr, cz + Math.sin(aa) * rr)
        }
      }
      for (let i = 0; i < 10; i++) {
        const cr = 22 + rand() * 55
        const spread = (rand() - 0.5) * 30
        addPlant(eye[0] + fwdX * cr + fwdZ * spread, eye[2] + fwdZ * cr - fwdX * spread)
      }
      for (let i = 0; i < 8; i++) {
        const cr = 10 + rand() * 16
        const spread = (rand() - 0.5) * 16
        addPlant(eye[0] + fwdX * cr + fwdZ * spread, eye[2] + fwdZ * cr - fwdX * spread)
      }
      for (let i = 0; i < 10; i++) {
        const rr = 8 + rand() * 18
        const ang = rand() * Math.PI * 2
        addPlant(eye[0] + Math.cos(ang) * rr, eye[2] + Math.sin(ang) * rr)
      }
      for (let i = 0; i < 70; i++) {
        const rr = 2 + Math.sqrt(rand()) * 38
        const ang = rand() * Math.PI * 2
        addPlant(eye[0] + Math.cos(ang) * rr, eye[2] + Math.sin(ang) * rr, 4)
      }
      const addCreature = (x: number, z: number): void => {
        const heading = rand() * Math.PI * 2
        fauna.push({
          x,
          z,
          y: groundY + terrainHeightAt(x, z, seed),
          dirX: Math.sin(heading),
          dirZ: Math.cos(heading),
          speed: 0.8 + rand() * 1.4,
          seed: rand(),
          seen: false,
          timer: 1 + rand() * 3,
        })
      }
      for (let i = 0; i < 14; i++) {
        const rr = Math.sqrt(rand()) * 240
        const ang = rand() * Math.PI * 2
        addCreature(eye[0] + Math.cos(ang) * rr, eye[2] + Math.sin(ang) * rr)
      }
      for (let i = 0; i < 3; i++) {
        const cr = 35 + rand() * 55
        const spread = (rand() - 0.5) * 34
        addCreature(eye[0] + fwdX * cr + fwdZ * spread, eye[2] + fwdZ * cr - fwdX * spread)
      }
    }
    hudClock = 1
  }

  function exitLanding(): void {
    if (!landing) return
    eye[0] = landing.savedEye[0]
    eye[1] = landing.savedEye[1]
    eye[2] = landing.savedEye[2]
    yaw = landing.savedYaw
    pitch = landing.savedPitch
    landing = null
    applyCockpitVisibility()
    flora = []
    fauna = []
    keys.clear()
    hudClock = 1
  }

  function nearestFlora(): { i: number; d: number } {
    let best = -1
    let bd = Infinity
    for (let i = 0; i < flora.length; i++) {
      const f = flora[i]
      if (!f.alive || f.kind >= 4) continue
      const d = Math.hypot(f.x - eye[0], f.z - eye[2])
      if (d < bd) {
        bd = d
        best = i
      }
    }
    return { i: best, d: bd }
  }

  function nearestFauna(): { i: number; d: number } {
    let best = -1
    let bd = Infinity
    for (let i = 0; i < fauna.length; i++) {
      const c = fauna[i]
      const d = Math.hypot(c.x - eye[0], c.z - eye[2])
      if (d < bd) {
        bd = d
        best = i
      }
    }
    return { i: best, d: bd }
  }

  function interactLanding(): void {
    if (!landing) return
    const nf = nearestFlora()
    if (nf.i >= 0 && nf.d < 4) {
      flora[nf.i].alive = false
      floraCollected++
      lifeMsg = 'FLORA COLETADA'
      lifeMsgT = 2.5
      hudClock = 1
      return
    }
    const nc = nearestFauna()
    if (nc.i >= 0 && nc.d < 24) {
      const c = fauna[nc.i]
      if (!c.seen) {
        c.seen = true
        faunaObserved++
        lifeMsg = 'FAUNA REGISTRADA'
      } else {
        lifeMsg = 'CRIATURA JA REGISTRADA'
      }
      lifeMsgT = 2.5
      c.dirX = (c.x - eye[0]) / (nc.d || 1)
      c.dirZ = (c.z - eye[2]) / (nc.d || 1)
      c.timer = 4
      hudClock = 1
    }
  }

  function surfacePalette(starIndex: number, planetIndex: number): {
    ground: [number, number, number]
    horizon: [number, number, number]
    skyTop: [number, number, number]
    groundFog: [number, number, number]
    sunColor: [number, number, number]
    sunDir: [number, number, number]
    typeIndex: number
    weather: number
  } {
    const star = galaxy.stars[starIndex]
    const pl = star.planets[planetIndex]
    const weather = pl.planetType === 7 ? 2
      : pl.planetType === 3 ? (pl.id % 3 === 0 ? 4 : 1)
      : pl.planetType === 5 ? 3
      : pl.planetType === 2 || pl.planetType === 6 || pl.planetType === 8 ? 1
      : 0
    const vis = planetVisualFromCatalog(pl.planetType, pl.id, pl.slot)
    const sc = starColor(star)
    const g = vis.color
    let ground: [number, number, number] = [g[0] * 0.42 + 0.05, g[1] * 0.40 + 0.05, g[2] * 0.36 + 0.04]
    if (pl.planetType === 6) ground = [0.55, 0.62, 0.70]
    else if (pl.planetType === 7) ground = [0.28, 0.33, 0.40]
    const horizon: [number, number, number] = [
      Math.min(1, ground[0] * 1.35 + sc[0] * 0.35 + 0.04),
      Math.min(1, ground[1] * 1.35 + sc[1] * 0.30 + 0.04),
      Math.min(1, ground[2] * 1.35 + sc[2] * 0.28 + 0.05),
    ]
    const skyTop: [number, number, number] = [
      Math.min(1, horizon[0] * 0.80 + ground[0] * 0.05 + 0.005),
      Math.min(1, horizon[1] * 0.80 + ground[1] * 0.05 + 0.010),
      Math.min(1, horizon[2] * 0.84 + ground[2] * 0.05 + 0.020),
    ]
    const groundFog: [number, number, number] = [horizon[0] * 0.8, horizon[1] * 0.8, horizon[2] * 0.82]
    const sunColor: [number, number, number] = [
      Math.min(1.3, sc[0] * 1.3 + 0.05),
      Math.min(1.3, sc[1] * 1.3 + 0.05),
      Math.min(1.3, sc[2] * 1.3 + 0.05),
    ]
    const [px, , pz] = planetRenderPos(starIndex, planetIndex)
    const sp = starPos(starIndex)
    const dh = normalize(sp[0] - px, 0.0001, sp[2] - pz)
    const sd = normalize(dh.x, 0.55, dh.z)
    return { ground, horizon, skyTop, groundFog, sunColor, sunDir: [sd.x, sd.y, sd.z], typeIndex: pl.planetType, weather }
  }

  // Mantem a camera fora dos discos texturizados (evita ficar "travado" dentro de planetas very large)
  function applyBodyKeepOut(): void {    const sys = currentTarget().starIndex
    const star = galaxy.stars[sys]
    for (let i = 0; i < star.planets.length; i++) {
      const pl = star.planets[i]
      const [px, py, pz] = planetRenderPos(sys, i)
      let dx = eye[0] - px
      let dy = eye[1] - py
      let dz = eye[2] - pz
      const dist = Math.hypot(dx, dy, dz)
      const vis = planetVisualFromCatalog(pl.planetType, pl.id, pl.slot)
      const keep = bodyWorldSize(vis.size, Math.max(dist, 1), false) * 1.45 + 1.0
      if (dist < keep) {
        let ux = dx
        let uy = dy
        let uz = dz
        if (dist < 1e-3) {
          ux = 0; uy = 1; uz = 0
        } else {
          ux /= dist; uy /= dist; uz /= dist
        }
        eye[0] = px + ux * keep
        eye[1] = py + uy * keep
        eye[2] = pz + uz * keep
      }
    }
    const sp = starPos(sys)
    const dx = eye[0] - sp[0]
    const dy = eye[1] - sp[1]
    const dz = eye[2] - sp[2]
    const ds = Math.hypot(dx, dy, dz)
    const starBase = Math.max(3.5, starSize(star) * 2.1)
    const keepStar = bodyWorldSize(starBase, Math.max(ds, 1), false) * 1.45 + 1.0
    if (ds < keepStar && ds > 1e-4) {
      const k = keepStar / ds
      eye[0] = sp[0] + dx * k
      eye[1] = sp[1] + dy * k
      eye[2] = sp[2] + dz * k
    }
  }

  // Billboards/quads texturizados (atlas RGBA 32-bit): sol glow/corona e planetas T0-T9 com LOD
  const GLOBE_FADE_START = 55
  const GLOBE_FADE_END = 70
  function buildScene(time: number): { bodies: BodyInstance[]; markers: BodyInstance[]; globes: GlobeInstance[] } {
    const t = currentTarget()
    const star = galaxy.stars[t.starIndex]
    const bodiesOut: BodyInstance[] = []
    const markersOut: BodyInstance[] = []
    const globesOut: GlobeInstance[] = []
    const pushBody = (x: number, y: number, z: number, size: number, r: number, g: number, b: number, a: number, typeIndex: number, seed: number) => {
      if (bodiesOut.length < 2048) bodiesOut.push({ x, y, z, size, r, g, b, a, typeIndex, seed, kind: 0, flags: 0 })
    }
    const pushMarker = (x: number, y: number, z: number, size: number, r: number, g: number, b: number, a: number, typeIndex: number) => {
      if (markersOut.length < 256) markersOut.push({ x, y, z, size, r, g, b, a, typeIndex, seed: 0, kind: 2, flags: 0 })
    }

    const sp = starPos(t.starIndex)
    const sDist = Math.hypot(sp[0] - eye[0], sp[1] - eye[1], sp[2] - eye[2])
    const sVis = starSize(star)
    const sColor = starColor(star)
    const starWorld = bodyWorldSize(Math.max(3.5, sVis * 2.1), sDist, t.kind === 'star')
    bodiesOut.push({ x: sp[0], y: sp[1], z: sp[2], size: starWorld, r: sColor[0], g: sColor[1], b: sColor[2], a: 1, typeIndex: 10 + (star.starClass % 4), seed: star.id % 1000, kind: 1, flags: 0 })

    const planetInfo: Array<{ x: number; y: number; z: number; pr: number }> = []
    for (let i = 0; i < star.planets.length; i++) {
      const [px, py, pz] = planetRenderPos(t.starIndex, i)
      planetInfo.push({ x: px, y: py, z: pz, pr: planetRadiusWorld(t.starIndex, i) })
    }
    for (let i = 0; i < star.planets.length; i++) {
      const pl = star.planets[i]
      const px = planetInfo[i].x, py = planetInfo[i].y, pz = planetInfo[i].z
      const isSel = t.kind === 'planet' && t.planetIndex === i
      const dist = Math.hypot(px - eye[0], py - eye[1], pz - eye[2])
      const vis = planetVisualFromCatalog(pl.planetType, pl.id, pl.slot)
      const wSize = bodyWorldSize(vis.size, dist, isSel)
      const fade = Math.max(0, Math.min(1, (dist - GLOBE_FADE_START) / (GLOBE_FADE_END - GLOBE_FADE_START)))

      let shx = 0, shy = 0, shz = 0, shr = 0
      let nearest = Infinity
      for (let j = 0; j < planetInfo.length; j++) {
        if (j === i) continue
        const o = planetInfo[j]
        const d = Math.hypot(o.x - px, o.y - py, o.z - pz)
        if (d > planetInfo[i].pr + o.pr && d < nearest) {
          nearest = d
          shx = (o.x - px) / d; shy = (o.y - py) / d; shz = (o.z - pz) / d
          shr = Math.asin(Math.min(0.9, o.pr / d))
        }
      }

      if (dist < GLOBE_FADE_END) {
        const ld = Math.hypot(sp[0] - px, sp[1] - py, sp[2] - pz) || 1
        const speed = (0.05 + ((pl.id % 97) / 97) * 0.12) * (pl.planetType === 6 ? 2.2 : 1)
        globesOut.push({
          x: px, y: py, z: pz, radius: wSize,
          r: vis.color[0], g: vis.color[1], b: vis.color[2],
          typeIndex: pl.planetType,
          seed: (pl.id ^ (pl.slot * 997)) % 10000,
          spin: (time * speed + (pl.id % 628) * 0.01) % (Math.PI * 2),
          light: [(sp[0] - px) / ld, (sp[1] - py) / ld, (sp[2] - pz) / ld],
          a: 1 - fade,
          ring: vis.ring,
          ringInner: vis.ringInner,
          ringOuter: vis.ringOuter,
          ringTilt: vis.ringTilt,
          shadowDir: [shx, shy, shz],
          shadowRadius: shr,
        })
      }
      if (dist > GLOBE_FADE_START) {
        pushBody(px, py, pz, wSize, vis.color[0], vis.color[1], vis.color[2], fade, pl.planetType, (pl.id ^ (pl.slot * 997)) % 10000)
      }
    }

    if (t.kind === 'star') {
      const [tx, ty, tz] = targetPos(t)
      pushMarker(tx, ty, tz, starWorld * 1.35, 0.85, 0.95, 1.0, 0.55, 10)
    }
    if (hovered && !sameTarget(hovered, t) && hovered.kind === 'star') {
      const [hx, hy, hz] = targetPos(hovered)
      pushMarker(hx, hy, hz, Math.max(1.5, starSize(galaxy.stars[hovered.starIndex]) * 1.2), 0.9, 0.97, 1.0, 0.5, 10)
    }
    return { bodies: bodiesOut, markers: markersOut, globes: globesOut }
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
    const onSurface = !!landing
    const lines = [
      `NOCTIS ENGINE  ·  ${galaxy.stats.starCount} estrelas  ·  ${galaxy.stats.planetCount} planetas  ·  ${lockHint}`,
      'Mira/hover: planetas do sistema com cor/tamanho/disco por tipo (catálogo) · G viagem automática (toggle, encara alvo) · WASD/Shift/Space/C mover',
      'F fixar estrela próxima · X solta (planeta->estrela, estrela->auto) · ESC libera mouse · [ / P ant. · N próx. · ] ou Backspace voltar · ,/. J/K planeta · Enter estrela · I computador (1-5 abas) · V nave externa · L pousar/decolar',
      `${mode}: ${targetLabel}  (${dist.toFixed(0)} u)  ·  ${targetInfo}${hoverHint}`,
    ]
    if (onSurface) lines[3] = `SUPERFÍCIE (L decolar): ${targetLabel}  (${dist.toFixed(0)} u do centro)  ·  ${targetInfo}`
    if (guide && !onSurface) lines.push(`"${guide.slice(0, 130)}${guide.length > 130 ? '.' : ''}"`)
    if (onSurface) lines.push('SUPERFÍCIE: WASD andar · Shift correr · mouse olhar · E interagir · L ou G decolar')
    else if (canLand(t)) lines.push(`L POUSAR em ${targetLabelOf(t)} (proximo da superficie)`)
    if (landing) {
      const bx = landing.spawnX - eye[0]
      const bz = landing.spawnZ - eye[2]
      const bd = Math.hypot(bx, bz)
      const bDeg = (((Math.atan2(bx, bz) * 180) / Math.PI) % 360 + 360) % 360
      lines.push(`FAROL (nave) a ${bd.toFixed(0)} u  -  ${cardinal(bDeg)}`)
      const lpl = galaxy.stars[landing.starIndex].planets[landing.planetIndex]
      if (lpl.planetType === 3) {
        lines.push(`VIDA: flora ${floraCollected}/${flora.length}  -  fauna ${faunaObserved}/${fauna.length}`)
        const nf = nearestFlora()
        const nc = nearestFauna()
        if (nf.i >= 0 && nf.d < 4) lines.push('E COLETAR flora')
        else if (nc.i >= 0 && nc.d < 24) lines.push('E REGISTRAR criatura proxima')
      } else {
        lines.push('VIDA: ambiente nao adequado (sem vegetacao/criaturas)')
      }
      if (lifeMsgT > 0) lines.push(lifeMsg)
    }
    hud.textContent = lines.join('\n')
    updatePanel(t, dist)
    consoleMode.textContent = landing ? 'SUPERFÍCIE' : autopilot ? 'VIAGEM' : pinned ? 'FIXO' : 'AUTO'
    consoleSpeed.textContent = `${shipSpeed.toFixed(0)} u/s`
    consoleTarget.textContent = targetLabel
    consoleDist.textContent = `${dist.toFixed(0)} u`
    consolePos.textContent = `${eye[0].toFixed(0)} ${eye[1].toFixed(0)} ${eye[2].toFixed(0)}`
  }

  function frame(now: number): void {
    const dt = Math.min((now - last) / 1000, 0.1)
    last = now
    const prevX = eye[0]
    const prevY = eye[1]
    const prevZ = eye[2]

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

    if (landing) {
      const seed = landing.seed
      const groundY = landing.groundY
      const walk = (keys.has('ShiftLeft') ? 15 : 6) * dt
      const fx = Math.sin(yaw)
      const fz = Math.cos(yaw)
      let mx = 0
      let mz = 0
      if (keys.has('KeyW')) { mx += fx * walk; mz += fz * walk }
      if (keys.has('KeyS')) { mx -= fx * walk; mz -= fz * walk }
      if (keys.has('KeyD')) { mx += right.x * walk; mz += right.z * walk }
      if (keys.has('KeyA')) { mx -= right.x * walk; mz -= right.z * walk }
      const h0 = terrainHeightAt(eye[0], eye[2], seed)
      const stepLen = Math.hypot(mx, mz)
      const wantMove = stepLen > 1e-6
      const sx0 = eye[0]
      const sz0 = eye[2]
      if (wantMove) {
        const blocked = (dx: number, dz: number): boolean => {
          const run = Math.hypot(dx, dz)
          if (run < 1e-6) return false
          return (terrainHeightAt(eye[0] + (dx / run) * 1.2, eye[2] + (dz / run) * 1.2, seed) - h0) / 1.2 > 2.0
        }
        if (!blocked(mx, mz)) {
          eye[0] += mx
          eye[2] += mz
        } else if (!blocked(mx, 0)) {
          eye[0] += mx
        } else if (!blocked(0, mz)) {
          eye[2] += mz
        }
      }
      const moving = Math.hypot(eye[0] - sx0, eye[2] - sz0) > 1e-4
      if (moving) walkPhase += dt * (keys.has('ShiftLeft') ? 15 : 8)
      const bob = moving ? Math.sin(walkPhase) * 0.04 : 0
      const hNear = surfaceClearanceH(eye[0], eye[2], seed, fx, fz)
      eye[1] = groundY + hNear + 2.2 + bob
      if (fauna.length) {
        for (const c of fauna) {
          c.timer -= dt
          if (c.timer <= 0) {
            c.timer = 2 + Math.random() * 4
            const ang = Math.random() * Math.PI * 2
            c.dirX = Math.sin(ang)
            c.dirZ = Math.cos(ang)
          }
          const dxp = c.x - eye[0]
          const dzp = c.z - eye[2]
          const dp = Math.hypot(dxp, dzp)
          let sp = c.speed
          if (dp < 15 && dp > 1e-3) {
            sp = c.speed * 2.4
            c.dirX = dxp / dp
            c.dirZ = dzp / dp
          }
          c.x += c.dirX * sp * dt
          c.z += c.dirZ * sp * dt
          c.y = groundY + terrainHeightAt(c.x, c.z, seed)
        }
      }
      if (lifeMsgT > 0) lifeMsgT -= dt
    } else {
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

      applyBodyKeepOut()
    }

    const moved = Math.hypot(eye[0] - prevX, eye[1] - prevY, eye[2] - prevZ) / Math.max(dt, 1e-3)
    shipSpeed += (moved - shipSpeed) * Math.min(1, dt * 8)

    const aspect = canvas.width / Math.max(1, canvas.height)
    perspective(proj, Math.PI / 3, aspect, landing ? 0.2 : 0.5, 9000)
    lookAt(view, eye, [eye[0] + dir.x, eye[1] + dir.y, eye[2] + dir.z], [0, 1, 0])
    // hover: crosshair quando pointer lock, senão posição do mouse
    const time = now * 0.001
    const camRight: [number, number, number] = [view[0], view[4], view[8]]
    const camUp: [number, number, number] = [view[1], view[5], view[9]]
    const blendTarget = externalView && !landing ? 1 : 0
    externalBlend += (blendTarget - externalBlend) * Math.min(1, dt * 7)
    if (externalBlend < 0.005) externalBlend = blendTarget
    if (landing) {
      hovered = null
      const pal = surfacePalette(landing.starIndex, landing.planetIndex)
      surface.draw(
        view,
        proj,
        [eye[0], eye[1], eye[2]],
        [dir.x, dir.y, dir.z],
        camRight,
        camUp,
        {
          groundY: landing.groundY,
          seed: landing.seed,
          time,
          fog: 1700,
          center: [eye[0], eye[2]],
          beacon: { x: landing.spawnX, y: landing.spawnY, z: landing.spawnZ, color: [0.55, 0.85, 1.0] },
          ...pal,
        },
        aspect,
      )
      if (flora.length || fauna.length) {
        const items: LifeItem[] = []
        for (const f of flora) {
          const minD = f.kind === 4 ? 0.8 : 4
          if (f.alive && Math.hypot(f.x - eye[0], f.z - eye[2]) > minD) {
            items.push({ x: f.x, y: f.y, z: f.z, w: f.w, h: f.h, kind: f.kind, r: f.r, g: f.g, b: f.b, seed: f.seed })
          }
        }
        for (const c of fauna) {
          if (Math.hypot(c.x - eye[0], c.z - eye[2]) > 4) {
            items.push({ x: c.x, y: c.y, z: c.z, w: 1.6, h: 1.1, kind: 1, r: 0.26, g: 0.2, b: 0.17, seed: c.seed })
          }
        }
        const wind = pal.weather === 1 || pal.weather === 3 ? 0.9
          : pal.weather === 2 ? 0.35
          : pal.weather === 4 ? 0.45 : 0.15
        life.draw(view, proj, items, camRight, time, wind)
      }
    } else {
      const aim = document.pointerLockElement === canvas ? { x: 0, y: 0 } : mouseNdc
      hovered = aim ? pickAtNdc(aim.x, aim.y) : null
      starfield.draw(view, proj, 260, overlay, 0)
      const scene = buildScene(time)
      bodies.draw(view, proj, camRight, camUp, scene.bodies, time)
      if (scene.globes.length) globes.draw(view, proj, [eye[0], eye[1], eye[2]], scene.globes)
      if (scene.markers.length) bodies.draw(view, proj, camRight, camUp, scene.markers, time + 0.5)
    }

    if (externalBlend > 0.01 && !landing) {
      const d = 7 * externalBlend
      const ox = 1.0 * externalBlend
      const oy = -0.6 * externalBlend
      const shipPos: [number, number, number] = [
        eye[0] + dir.x * d + camRight[0] * ox + camUp[0] * oy,
        eye[1] + dir.y * d + camRight[1] * ox + camUp[1] * oy,
        eye[2] + dir.z * d + camRight[2] * ox + camUp[2] * oy,
      ]
      ship.draw(view, proj, shipPos, [dir.x, dir.y, dir.z], camRight, camUp, time, externalBlend)
    }

    hudClock += dt
    if (hudClock > 0.15) {
      hudClock = 0
      updateHud()
    }
    requestAnimationFrame(frame)
  }

  updateHud()
  requestAnimationFrame(frame)
}

main().catch((err) => {
  const hud = document.querySelector<HTMLDivElement>('#hud')
  if (hud) hud.textContent = `Erro: ${String(err)}`
  console.error(err)
})
