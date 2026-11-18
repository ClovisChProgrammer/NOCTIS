import type { Mat4 } from './math.ts'

const GROUND_VS = `#version 300 es
layout(location=0) in vec2 aXZ;
uniform mat4 uView;
uniform mat4 uProj;
uniform vec2 uCenter;
uniform float uGroundY;
uniform float uSeed;
out vec3 vWorld;
out vec3 vNormal;

uint hashU(uvec2 p){
  uint h = p.x * 1664525u + p.y * 1013904223u + 0x9e3779b9u;
  h ^= h >> 16;
  h *= 0x85ebca6bu;
  h ^= h >> 13;
  return h;
}
float hash21(vec2 p){
  uvec2 i = uvec2(ivec2(floor(p)));
  return float(hashU(i) & 0x00ffffffu) / 16777216.0;
}
float vnoise2(vec2 p){
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash21(i), hash21(i + vec2(1,0)), f.x),
             mix(hash21(i + vec2(0,1)), hash21(i + vec2(1,1)), f.x), f.y);
}
float fbm2(vec2 p){
  float a = 0.5;
  float s = 0.0;
  for (int i = 0; i < 4; i++) {
    s += a * vnoise2(p);
    p = p * 2.03 + vec2(17.1, 9.7);
    a *= 0.5;
  }
  return s;
}
float terrainH(vec2 xz){
  vec2 q = xz * 0.010 + vec2(uSeed * 3.7, uSeed * 1.3);
  float h = (fbm2(q) - 0.5) * 30.0;
  h += (fbm2(xz * 0.055) - 0.5) * 5.0;
  h += (vnoise2(xz * 0.30) - 0.5) * 0.9;
  return h;
}

void main(){
  vec2 xz = aXZ + uCenter;
  float h = terrainH(xz);
  vec3 world = vec3(xz.x, uGroundY + h, xz.y);
  float e = 1.1;
  float hx = terrainH(xz + vec2(e, 0.0)) - terrainH(xz - vec2(e, 0.0));
  float hz = terrainH(xz + vec2(0.0, e)) - terrainH(xz - vec2(0.0, e));
  vNormal = normalize(vec3(-hx, 2.0 * e, -hz));
  vWorld = world;
  gl_Position = uProj * uView * vec4(world, 1.0);
}`

const GROUND_FS = `#version 300 es
precision highp float;
in vec3 vWorld;
in vec3 vNormal;
uniform vec3 uGround;
uniform vec3 uHorizon;
uniform vec3 uSunColor;
uniform vec3 uSunDir;
uniform vec3 uCamPos;
uniform float uFogDist;
uniform float uTime;
uniform float uType;
uniform float uWeather;
out vec4 outColor;

float hash21(vec2 p){
  p = fract(p * vec2(123.34, 345.45));
  p += dot(p, p + 34.345);
  return fract(p.x * p.y);
}
vec2 hash22(vec2 p){
  return fract(sin(vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)))) * 43758.5453);
}
float vnoise2(vec2 p){
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash21(i), hash21(i + vec2(1,0)), f.x),
             mix(hash21(i + vec2(0,1)), hash21(i + vec2(1,1)), f.x), f.y);
}
float fbm2(vec2 p){
  float a = 0.5;
  float s = 0.0;
  for (int i = 0; i < 4; i++) {
    s += a * vnoise2(p);
    p = p * 2.03 + vec2(17.1, 9.7);
    a *= 0.5;
  }
  return s;
}
float voronoiEdge(vec2 p){
  vec2 n = floor(p);
  vec2 f = fract(p);
  float d1 = 8.0;
  float d2 = 8.0;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 g = vec2(float(i), float(j));
      vec2 o = hash22(n + g);
      vec2 r = g + o - f;
      float d = dot(r, r);
      if (d < d1) {
        d2 = d1;
        d1 = d;
      } else if (d < d2) {
        d2 = d;
      }
    }
  }
  return sqrt(d2) - sqrt(d1);
}

void main(){
  vec3 n = normalize(vNormal);
  vec2 p = vWorld.xz;
  float slope = 1.0 - clamp(n.y, 0.0, 1.0);
  float m = fbm2(p * 0.10 + vec2(4.0));
  float m2 = vnoise2(p * 0.65);
  vec3 base = mix(uGround * 0.55, uGround * 1.25, m);
  base = mix(base, uGround * 1.05 + vec3(0.04, 0.035, 0.02), smoothstep(0.55, 0.95, m2) * 0.35);
  base = mix(base, uGround * 0.42 + vec3(0.03, 0.03, 0.035), clamp(slope * 1.6, 0.0, 0.6));

  float t = uType;
  if (t < 0.5 || (t > 0.5 && t < 1.5) || (t > 3.5 && t < 5.5)) {
    float cell = voronoiEdge(p * 0.65);
    float fine = fbm2(p * 1.7 + vec2(3.0));
    float pebbles = smoothstep(0.70, 0.95, vnoise2(p * 3.1 + vec2(7.0)));
    base *= 0.78 + 0.42 * fine;
    base = mix(base, base * 0.40 + vec3(0.020, 0.018, 0.015), (1.0 - smoothstep(0.02, 0.16, cell)) * 0.60);
    base = mix(base, base * 1.35 + vec3(0.035, 0.028, 0.020), pebbles * 0.45);
  }
  if (t < 0.5) {
    base = mix(base, base * 0.60 + vec3(0.05, 0.015, 0.0), 0.35);
  }
  if (t > 6.5 && t < 7.5) {
    float fac = abs(sin((p.x + p.y) * 0.8 + vnoise2(p * 0.35) * 6.283));
    float shard = smoothstep(0.75, 0.98, vnoise2(p * 1.4));
    base = mix(base * 0.70, base * 1.45, fac * 0.55);
    base += vec3(0.04, 0.09, 0.13) * shard * 0.45;
    base = mix(base, vec3(0.52, 0.68, 0.80), smoothstep(0.60, 0.90, fbm2(p * 0.7)) * 0.30);
  }
  if (t > 7.5 && t < 8.5) {
    float q = voronoiEdge(p * 0.50);
    base = mix(base, base * 1.50 + vec3(0.10, 0.08, 0.06), (1.0 - smoothstep(0.01, 0.10, q)) * 0.45);
    base += vec3(0.06, 0.05, 0.04) * smoothstep(0.93, 0.99, vnoise2(p * 5.0));
  }
  if (t > 2.5 && t < 3.5) {
    float grass = vnoise2(vec2(p.x * 2.6, p.y * 0.65));
    float moss = fbm2(p * 0.8);
    vec3 g1 = uGround * 0.65 + vec3(0.02, 0.10, 0.015);
    vec3 g2 = uGround * 1.25 + vec3(0.05, 0.18, 0.03);
    base = mix(base, mix(g1, g2, grass), 0.42);
    base = mix(base, base * 1.12, moss * 0.25);
  }
  if ((t > 1.5 && t < 2.5) || (t > 5.5 && t < 6.5)) {
    float band = fbm2(vec2(p.x * 0.040, p.y * 0.120) + vec2(uTime * 0.008, uTime * 0.015));
    float swirl = vnoise2(p * 0.20 + vec2(uTime * 0.02, 0.0));
    base = mix(base, uGround * 1.50 + vec3(0.06, 0.07, 0.08), smoothstep(0.40, 0.72, band) * 0.65);
    base = mix(base, uGround * 1.15, smoothstep(0.55, 0.85, swirl) * 0.25);
  }
  if (uWeather > 1.5 && uWeather < 2.5) base = mix(base, vec3(0.78, 0.84, 0.90), 0.18);
  if (uWeather > 2.5 && uWeather < 3.5) base *= vec3(1.10, 1.00, 0.82);
  if (uWeather > 0.5 && uWeather < 1.5) base *= 0.82;

  float sun = max(dot(n, uSunDir), 0.0);
  vec3 col = base * (0.30 + 0.95 * sun) + uSunColor * (0.05 + 0.22 * sun) * 0.55;
  if (t < 0.5 || (t > 8.5 && t < 9.5)) {
    float lava = 1.0 - smoothstep(0.02, 0.12, voronoiEdge(p * 0.55));
    float pulse = 0.75 + 0.25 * sin(uTime * 2.0 + p.x * 0.5 + p.y * 0.3);
    col += vec3(1.10, 0.24, 0.03) * lava * pulse * (t < 0.5 ? 0.55 : 1.25);
  }
  float d = length(vWorld - uCamPos);
  float fog = smoothstep(uFogDist * 0.30, uFogDist, d);
  col = mix(col, uHorizon, fog);
  outColor = vec4(col, 1.0);
}`

const SKY_VS = `#version 300 es
layout(location=0) in vec2 aNdc;
out vec2 vNdc;
void main(){
  vNdc = aNdc;
  gl_Position = vec4(aNdc, 0.999, 1.0);
}`

const SKY_FS = `#version 300 es
precision highp float;
in vec2 vNdc;
uniform vec3 uForward;
uniform vec3 uRight;
uniform vec3 uUp;
uniform float uTanFov;
uniform float uAspect;
uniform vec3 uTop;
uniform vec3 uHorizon;
uniform vec3 uGroundFog;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform float uTime;
uniform float uCloud;
out vec4 outColor;

float hash31(vec3 p){
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float hash21(vec2 p){
  p = fract(p * vec2(123.34, 345.45));
  p += dot(p, p + 34.345);
  return fract(p.x * p.y);
}
float vnoise2(vec2 p){
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash21(i), hash21(i + vec2(1,0)), f.x),
             mix(hash21(i + vec2(0,1)), hash21(i + vec2(1,1)), f.x), f.y);
}
float fbm2(vec2 p){
  float a = 0.5;
  float s = 0.0;
  for (int i = 0; i < 4; i++) {
    s += a * vnoise2(p);
    p = p * 2.03 + vec2(17.1, 9.7);
    a *= 0.5;
  }
  return s;
}

void main(){
  vec3 dir = normalize(uForward + uRight * (vNdc.x * uAspect * uTanFov) + uUp * (vNdc.y * uTanFov));
  float h = dir.y;
  vec3 col = mix(uHorizon, uTop, smoothstep(-0.02, 1.2, h));
  float sd = max(dot(dir, uSunDir), 0.0);
  col += uSunColor * (pow(sd, 1400.0) * 1.9 + pow(sd, 24.0) * 0.18 + pow(sd, 4.0) * 0.02);
  if (h > 0.04) {
    vec3 cell = floor(dir * 260.0);
    float st = hash31(cell);
    float tw = 0.55 + 0.45 * sin(uTime * 2.3 + st * 40.0);
    col += vec3(0.85, 0.9, 1.0) * smoothstep(0.9986, 0.9994, st) * 0.85 * tw * smoothstep(0.04, 0.30, h);
  }
  if (uCloud > 0.01 && h > 0.02) {
    vec2 cuv = dir.xz / (dir.y + 0.30) * 2.0;
    float cl = fbm2(cuv * 1.3 + vec2(uTime * 0.008, uTime * 0.004));
    cl = smoothstep(0.46, 0.70, cl) * smoothstep(0.0, 0.16, h) * uCloud;
    vec3 cloudCol = mix(uHorizon, vec3(0.82, 0.86, 0.92), 0.45) * (0.55 + 0.45 * clamp(sd, 0.0, 1.0));
    col = mix(col, cloudCol, cl * 0.60);
  }
  if (h < 0.0) col = mix(uHorizon, uGroundFog, smoothstep(0.0, -0.35, h));
  outColor = vec4(col, 1.0);
}`

const WEATHER_VS = `#version 300 es
layout(location=0) in vec2 aNdc;
void main(){
  gl_Position = vec4(aNdc, 0.0, 1.0);
}`

const WEATHER_FS = `#version 300 es
precision highp float;
uniform float uTime;
uniform float uKind;
uniform vec2 uRes;
out vec4 outColor;

float hash12(vec2 p){
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

void main(){
  vec2 uv = gl_FragCoord.xy / uRes;
  float aspect = uRes.x / max(uRes.y, 1.0);
  float a = 0.0;
  vec3 c = vec3(1.0);
  if (uKind < 1.5) {
    vec2 q = vec2(uv.x * aspect, uv.y) * vec2(18.0, 32.0);
    q.x += q.y * 0.18;
    q.y += uTime * 12.0;
    vec2 id = floor(q);
    vec2 f = fract(q);
    float rnd = hash12(id);
    float streak = smoothstep(0.06, 0.0, abs(f.x - 0.5)) * smoothstep(0.0, 0.12, f.y) * smoothstep(1.0, 0.65, f.y);
    a = streak * step(0.55, rnd) * 0.65;
    c = vec3(0.72, 0.82, 0.98);
  } else if (uKind < 2.5) {
    vec2 q = vec2(uv.x * aspect, uv.y) * vec2(14.0, 20.0);
    q.x += sin(q.y * 0.8 + uTime * 0.7) * 0.5;
    q.y += uTime * 2.0;
    vec2 id = floor(q);
    vec2 f = fract(q) - 0.5;
    a = smoothstep(0.16, 0.0, length(f)) * step(0.80, hash12(id)) * 0.9;
    c = vec3(0.92, 0.96, 1.0);
  } else if (uKind < 3.5) {
    vec2 q = vec2(uv.x * aspect, uv.y) * vec2(9.0, 36.0);
    q.x += uTime * 2.8;
    vec2 id = floor(q);
    vec2 f = fract(q);
    float streak = smoothstep(0.08, 0.0, abs(f.y - 0.5)) * smoothstep(0.0, 0.2, f.x) * smoothstep(1.0, 0.5, f.x);
    a = streak * step(0.72, hash12(id)) * 0.4;
    c = vec3(0.72, 0.60, 0.40);
  } else {
    vec2 q = vec2(uv.x * aspect, uv.y) * vec2(22.0, 28.0);
    q.x += sin(q.y * 0.7 + uTime * 1.1) * 0.6;
    q.y += uTime * 1.2;
    vec2 id = floor(q);
    vec2 f = fract(q) - 0.5;
    a = smoothstep(0.24, 0.0, length(f)) * step(0.88, hash12(id)) * 0.75;
    c = vec3(0.45, 0.95, 0.55);
  }
  if (a < 0.01) discard;
  outColor = vec4(c, a * 0.55);
}`

const BEACON_VS = `#version 300 es
layout(location=0) in vec2 aCorner;
uniform mat4 uView;
uniform mat4 uProj;
uniform vec3 uBase;
uniform vec3 uRight;
uniform float uHalfW;
uniform float uHeight;
out vec2 vC;
void main(){
  vC = aCorner;
  vec3 pos = uBase + uRight * (aCorner.x * uHalfW) + vec3(0.0, aCorner.y * uHeight, 0.0);
  gl_Position = uProj * uView * vec4(pos, 1.0);
}`

const BEACON_FS = `#version 300 es
precision highp float;
in vec2 vC;
uniform vec3 uColor;
uniform float uTime;
uniform float uFade;
out vec4 outColor;
void main(){
  float edge = 1.0 - abs(vC.x);
  float fade = pow(clamp(1.0 - vC.y, 0.0, 1.0), 1.35);
  float core = exp(-vC.x * vC.x * 7.0);
  float pulse = 0.72 + 0.28 * sin(uTime * 2.2 - vC.y * 6.0);
  float a = (core * 0.32 + edge * edge * 0.18) * fade * pulse * uFade;
  outColor = vec4(uColor * (1.1 + core * 0.9), a);
}`

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const s = gl.createShader(type)!
  gl.shaderSource(s, src)
  gl.compileShader(s)
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || 'shader')
  return s
}

function link(gl: WebGL2RenderingContext, vs: string, fs: string): WebGLProgram {
  const prog = gl.createProgram()!
  gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, vs))
  gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, fs))
  gl.linkProgram(prog)
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) || 'prog')
  return prog
}

function fract(v: number): number {
  return v - Math.floor(v)
}

function hash21(px: number, py: number): number {
  const ix = Math.floor(px) | 0
  const iy = Math.floor(py) | 0
  let h = (Math.imul(ix, 1664525) + Math.imul(iy, 1013904223) + 0x9e3779b9) >>> 0
  h ^= h >>> 16
  h = Math.imul(h, 0x85ebca6b) >>> 0
  h ^= h >>> 13
  return (h & 0x00ffffff) / 16777216
}

function vnoise2(px: number, py: number): number {
  const ix = Math.floor(px)
  const iy = Math.floor(py)
  let fx = fract(px)
  let fy = fract(py)
  fx = fx * fx * (3 - 2 * fx)
  fy = fy * fy * (3 - 2 * fy)
  const a = hash21(ix, iy)
  const b = hash21(ix + 1, iy)
  const c = hash21(ix, iy + 1)
  const d = hash21(ix + 1, iy + 1)
  const top = a + (b - a) * fx
  const bottom = c + (d - c) * fx
  return top + (bottom - top) * fy
}

function fbm2(px: number, py: number): number {
  let a = 0.5
  let s = 0
  let x = px
  let y = py
  for (let i = 0; i < 4; i++) {
    s += a * vnoise2(x, y)
    x = x * 2.03 + 17.1
    y = y * 2.03 + 9.7
    a *= 0.5
  }
  return s
}

// Replica em JS a funcao terrainH do vertex shader (mantem o olho na superficie)
export function terrainHeightAt(x: number, z: number, seed: number): number {
  const qx = x * 0.010 + seed * 3.7
  const qz = z * 0.010 + seed * 1.3
  let h = (fbm2(qx, qz) - 0.5) * 30
  h += (fbm2(x * 0.055, z * 0.055) - 0.5) * 5
  h += (vnoise2(x * 0.30, z * 0.30) - 0.5) * 0.9
  return h
}

export interface SurfaceParams {
  groundY: number
  seed: number
  time: number
  fog: number
  typeIndex: number
  weather: number
  center: [number, number]
  ground: [number, number, number]
  horizon: [number, number, number]
  skyTop: [number, number, number]
  groundFog: [number, number, number]
  sunColor: [number, number, number]
  sunDir: [number, number, number]
  beacon?: { x: number; y: number; z: number; color: [number, number, number] }
}

export interface SurfaceRenderer {
  draw(
    view: Mat4,
    proj: Mat4,
    eye: [number, number, number],
    forward: [number, number, number],
    right: [number, number, number],
    up: [number, number, number],
    params: SurfaceParams,
    aspect: number,
  ): void
}

export function createSurfaceRenderer(gl: WebGL2RenderingContext): SurfaceRenderer {
  const groundProg = link(gl, GROUND_VS, GROUND_FS)
  const skyProg = link(gl, SKY_VS, SKY_FS)
  const beaconProg = link(gl, BEACON_VS, BEACON_FS)
  const weatherProg = link(gl, WEATHER_VS, WEATHER_FS)

  const RINGS = 180
  const SECT = 192
  const RADIUS = 1800
  const verts = new Float32Array((RINGS + 1) * SECT * 2)
  let vi = 0
  for (let i = 0; i <= RINGS; i++) {
    const r = RADIUS * Math.pow(i / RINGS, 3.0)
    for (let j = 0; j < SECT; j++) {
      const a = (j / SECT) * Math.PI * 2
      verts[vi++] = Math.cos(a) * r
      verts[vi++] = Math.sin(a) * r
    }
  }
  const index = new Uint32Array(RINGS * SECT * 6)
  let ii = 0
  for (let i = 0; i < RINGS; i++) {
    for (let j = 0; j < SECT; j++) {
      const j2 = (j + 1) % SECT
      const a = i * SECT + j
      const b = i * SECT + j2
      const c = (i + 1) * SECT + j
      const d = (i + 1) * SECT + j2
      index[ii++] = a; index[ii++] = c; index[ii++] = b
      index[ii++] = b; index[ii++] = c; index[ii++] = d
    }
  }

  const groundVao = gl.createVertexArray()!
  gl.bindVertexArray(groundVao)
  const groundVbo = gl.createBuffer()!
  gl.bindBuffer(gl.ARRAY_BUFFER, groundVbo)
  gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW)
  gl.enableVertexAttribArray(0)
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 8, 0)
  const groundIbo = gl.createBuffer()!
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, groundIbo)
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, index, gl.STATIC_DRAW)

  const skyVao = gl.createVertexArray()!
  gl.bindVertexArray(skyVao)
  const skyVbo = gl.createBuffer()!
  gl.bindBuffer(gl.ARRAY_BUFFER, skyVbo)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
  gl.enableVertexAttribArray(0)
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 8, 0)

  const beaconVao = gl.createVertexArray()!
  gl.bindVertexArray(beaconVao)
  const beaconVbo = gl.createBuffer()!
  gl.bindBuffer(gl.ARRAY_BUFFER, beaconVbo)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, 0, 1, 0, -1, 1, 1, 1]), gl.STATIC_DRAW)
  gl.enableVertexAttribArray(0)
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 8, 0)
  gl.bindVertexArray(null)

  const g = {
    view: gl.getUniformLocation(groundProg, 'uView'),
    proj: gl.getUniformLocation(groundProg, 'uProj'),
    center: gl.getUniformLocation(groundProg, 'uCenter'),
    groundY: gl.getUniformLocation(groundProg, 'uGroundY'),
    seed: gl.getUniformLocation(groundProg, 'uSeed'),
    ground: gl.getUniformLocation(groundProg, 'uGround'),
    horizon: gl.getUniformLocation(groundProg, 'uHorizon'),
    sunColor: gl.getUniformLocation(groundProg, 'uSunColor'),
    sunDir: gl.getUniformLocation(groundProg, 'uSunDir'),
    camPos: gl.getUniformLocation(groundProg, 'uCamPos'),
    fogDist: gl.getUniformLocation(groundProg, 'uFogDist'),
    time: gl.getUniformLocation(groundProg, 'uTime'),
    typeIndex: gl.getUniformLocation(groundProg, 'uType'),
    weather: gl.getUniformLocation(groundProg, 'uWeather'),
  }
  const s = {
    forward: gl.getUniformLocation(skyProg, 'uForward'),
    right: gl.getUniformLocation(skyProg, 'uRight'),
    up: gl.getUniformLocation(skyProg, 'uUp'),
    tanFov: gl.getUniformLocation(skyProg, 'uTanFov'),
    aspect: gl.getUniformLocation(skyProg, 'uAspect'),
    top: gl.getUniformLocation(skyProg, 'uTop'),
    horizon: gl.getUniformLocation(skyProg, 'uHorizon'),
    groundFog: gl.getUniformLocation(skyProg, 'uGroundFog'),
    sunDir: gl.getUniformLocation(skyProg, 'uSunDir'),
    sunColor: gl.getUniformLocation(skyProg, 'uSunColor'),
    time: gl.getUniformLocation(skyProg, 'uTime'),
    cloud: gl.getUniformLocation(skyProg, 'uCloud'),
  }
  const b = {
    view: gl.getUniformLocation(beaconProg, 'uView'),
    proj: gl.getUniformLocation(beaconProg, 'uProj'),
    base: gl.getUniformLocation(beaconProg, 'uBase'),
    right: gl.getUniformLocation(beaconProg, 'uRight'),
    halfW: gl.getUniformLocation(beaconProg, 'uHalfW'),
    height: gl.getUniformLocation(beaconProg, 'uHeight'),
    color: gl.getUniformLocation(beaconProg, 'uColor'),
    time: gl.getUniformLocation(beaconProg, 'uTime'),
    fade: gl.getUniformLocation(beaconProg, 'uFade'),
  }
  const w = {
    time: gl.getUniformLocation(weatherProg, 'uTime'),
    kind: gl.getUniformLocation(weatherProg, 'uKind'),
    res: gl.getUniformLocation(weatherProg, 'uRes'),
  }
  const idxCount = index.length
  const tanFov = Math.tan(Math.PI / 6)

  function draw(
    view: Mat4,
    proj: Mat4,
    eye: [number, number, number],
    forward: [number, number, number],
    right: [number, number, number],
    up: [number, number, number],
    p: SurfaceParams,
    aspect: number,
  ): void {
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight)
    gl.disable(gl.BLEND)
    gl.disable(gl.DEPTH_TEST)
    gl.depthMask(true)
    gl.colorMask(true, true, true, true)
    gl.clearColor(0.02, 0.03, 0.05, 1)
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
    gl.depthMask(false)

    gl.useProgram(skyProg)
    gl.uniform3f(s.forward, forward[0], forward[1], forward[2])
    gl.uniform3f(s.right, right[0], right[1], right[2])
    gl.uniform3f(s.up, up[0], up[1], up[2])
    gl.uniform1f(s.tanFov, tanFov)
    gl.uniform1f(s.aspect, aspect)
    gl.uniform3f(s.top, p.skyTop[0], p.skyTop[1], p.skyTop[2])
    gl.uniform3f(s.horizon, p.horizon[0], p.horizon[1], p.horizon[2])
    gl.uniform3f(s.groundFog, p.groundFog[0], p.groundFog[1], p.groundFog[2])
    gl.uniform3f(s.sunDir, p.sunDir[0], p.sunDir[1], p.sunDir[2])
    gl.uniform3f(s.sunColor, p.sunColor[0], p.sunColor[1], p.sunColor[2])
    gl.uniform1f(s.time, p.time)
    const cloud = (p.typeIndex === 2 || p.typeIndex === 6) ? 1.0
      : p.typeIndex === 3 ? 0.75
      : p.typeIndex === 8 ? 0.65
      : p.typeIndex === 5 ? 0.45
      : p.typeIndex === 7 ? 0.18 : 0.0
    gl.uniform1f(s.cloud, cloud)
    gl.bindVertexArray(skyVao)
    gl.drawArrays(gl.TRIANGLES, 0, 3)

    gl.enable(gl.DEPTH_TEST)
    gl.depthFunc(gl.LEQUAL)
    gl.depthMask(true)
    gl.useProgram(groundProg)
    gl.uniformMatrix4fv(g.view, false, view)
    gl.uniformMatrix4fv(g.proj, false, proj)
    gl.uniform2f(g.center, p.center[0], p.center[1])
    gl.uniform1f(g.groundY, p.groundY)
    gl.uniform1f(g.seed, p.seed)
    gl.uniform3f(g.ground, p.ground[0], p.ground[1], p.ground[2])
    gl.uniform3f(g.horizon, p.horizon[0], p.horizon[1], p.horizon[2])
    gl.uniform3f(g.sunColor, p.sunColor[0], p.sunColor[1], p.sunColor[2])
    gl.uniform3f(g.sunDir, p.sunDir[0], p.sunDir[1], p.sunDir[2])
    gl.uniform3f(g.camPos, eye[0], eye[1], eye[2])
    gl.uniform1f(g.fogDist, p.fog)
    gl.uniform1f(g.time, p.time)
    gl.uniform1f(g.typeIndex, p.typeIndex)
    gl.uniform1f(g.weather, p.weather)
    gl.bindVertexArray(groundVao)
    gl.drawElements(gl.TRIANGLES, idxCount, gl.UNSIGNED_INT, 0)

    if (p.beacon) {
      const bdx = p.beacon.x - eye[0]
      const bdy = p.beacon.y - eye[1]
      const bdz = p.beacon.z - eye[2]
      const bdist = Math.hypot(bdx, bdy, bdz)
      if (bdist > 8) {
        gl.enable(gl.BLEND)
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE)
        gl.depthMask(false)
        gl.useProgram(beaconProg)
        gl.uniformMatrix4fv(b.view, false, view)
        gl.uniformMatrix4fv(b.proj, false, proj)
        gl.uniform3f(b.base, p.beacon.x, p.beacon.y, p.beacon.z)
        const rl = Math.hypot(right[0], right[2]) || 1
        gl.uniform3f(b.right, right[0] / rl, 0, right[2] / rl)
        gl.uniform1f(b.halfW, 1.2)
        gl.uniform1f(b.height, 18)
        gl.uniform3f(b.color, p.beacon.color[0], p.beacon.color[1], p.beacon.color[2])
        gl.uniform1f(b.time, p.time)
        gl.uniform1f(b.fade, Math.max(0, Math.min(1, (bdist - 12) / 28)) * 0.8)
        gl.bindVertexArray(beaconVao)
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
        gl.depthMask(true)
        gl.disable(gl.BLEND)
      }
    }

    if (p.weather > 0.5) {
      gl.disable(gl.DEPTH_TEST)
      gl.depthMask(false)
      gl.enable(gl.BLEND)
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)
      gl.useProgram(weatherProg)
      gl.uniform1f(w.time, p.time)
      gl.uniform1f(w.kind, p.weather)
      gl.uniform2f(w.res, gl.drawingBufferWidth, gl.drawingBufferHeight)
      gl.bindVertexArray(skyVao)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
      gl.disable(gl.BLEND)
      gl.depthMask(true)
      gl.enable(gl.DEPTH_TEST)
    }
  }

  return { draw }
}
