import type { Mat4 } from './math.ts'

const VS = `#version 300 es
layout(location=0) in vec3 aPos;
uniform mat4 uView;
uniform mat4 uProj;
uniform mat4 uModel;
out vec3 vLocal;
out vec3 vWorld;
out vec3 vNormal;
void main(){
  vec4 world = uModel * vec4(aPos, 1.0);
  vLocal = aPos;
  vWorld = world.xyz;
  vNormal = mat3(uModel) * aPos;
  gl_Position = uProj * uView * world;
}`

const FS = `#version 300 es
precision highp float;
in vec3 vLocal;
in vec3 vWorld;
in vec3 vNormal;
uniform vec3 uTint;
uniform vec3 uLightDir;
uniform vec3 uCamPos;
uniform float uType;
uniform float uSeed;
uniform float uSpin;
uniform float uAlpha;
uniform float uRing;
uniform float uRingInnerFrac;
uniform vec3 uRingColor;
uniform vec3 uRingNormal;
uniform vec3 uShadowDir;
uniform float uShadowRadius;
out vec4 outColor;

float hash31(vec3 p){
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float vnoise(vec3 x){
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash31(i), hash31(i + vec3(1,0,0)), f.x),
        mix(hash31(i + vec3(0,1,0)), hash31(i + vec3(1,1,0)), f.x), f.y),
    mix(mix(hash31(i + vec3(0,0,1)), hash31(i + vec3(1,0,1)), f.x),
        mix(hash31(i + vec3(0,1,1)), hash31(i + vec3(1,1,1)), f.x), f.y),
    f.z);
}
float fbm(vec3 p){
  float a = 0.5;
  float s = 0.0;
  for(int i = 0; i < 4; i++){
    s += a * vnoise(p);
    p = p * 2.07 + 11.3;
    a *= 0.5;
  }
  return s;
}
vec3 rotY(vec3 p, float a){
  float c = cos(a);
  float s = sin(a);
  return vec3(c * p.x + s * p.z, p.y, -s * p.x + c * p.z);
}

void main(){
  if (uRing > 0.5) {
    float rr = length(vLocal.xz);
    float inner = smoothstep(uRingInnerFrac, uRingInnerFrac + 0.06, rr);
    float outer = 1.0 - smoothstep(0.9, 1.0, rr);
    float bands = 0.65 + 0.35 * sin(rr * 42.0 + uSeed * 0.3);
    vec3 rc = uRingColor * bands;
    float rl = 0.25 + 0.75 * max(dot(normalize(uRingNormal), normalize(uLightDir)), 0.0);
    float ra = inner * outer * uAlpha * 0.85;
    if (ra < 0.01) discard;
    outColor = vec4(rc * rl, ra);
    return;
  }
  vec3 n = normalize(vNormal);
  vec3 P = rotY(vLocal, uSpin);
  float lat = asin(clamp(vLocal.y, -1.0, 1.0));
  vec3 sd = vec3(uSeed * 0.317, uSeed * 0.191, uSeed * 0.713);
  float n1 = fbm(P * 2.1 + sd);
  float n2 = fbm(P * 5.3 - sd * 0.7);
  float band = fbm(vec3(P.x * 1.3, P.y * 7.0, P.z * 1.3) + sd);
  vec3 col = uTint;

  if (uType < 0.5) { // hot
    col = mix(uTint * 0.35, vec3(1.0, 0.62, 0.28), smoothstep(0.35, 0.75, n2));
    col = mix(col, vec3(1.0, 0.85, 0.55), smoothstep(0.62, 0.8, n1) * 0.6);
  } else if (uType < 1.5) { // cratered
    col = uTint * (0.55 + 0.55 * n2);
    float cr = smoothstep(0.6, 0.72, fbm(P * 9.0 + sd));
    col *= 1.0 - 0.45 * cr;
    col = mix(col, uTint * 1.25, (1.0 - smoothstep(0.2, 0.45, n2)) * 0.3);
  } else if (uType < 2.5) { // dense clouds
    col = mix(uTint, vec3(0.9, 0.93, 0.98), 0.55 + 0.35 * n2);
    col *= 0.85 + 0.25 * n1;
  } else if (uType < 3.5) { // life world
    float land = smoothstep(0.42, 0.56, n1 + 0.12 * n2);
    vec3 ocean = vec3(0.06, 0.22, 0.5) * (0.7 + 0.6 * n2);
    vec3 ground = mix(vec3(0.16, 0.38, 0.16), vec3(0.45, 0.42, 0.25), n2);
    col = mix(ocean, ground, land);
    float ice = smoothstep(0.72, 0.86, abs(vLocal.y));
    col = mix(col, vec3(0.88, 0.94, 1.0), ice);
    float cl = smoothstep(0.58, 0.7, fbm(P * 4.0 + sd * 1.3));
    col = mix(col, vec3(0.92, 0.95, 1.0), cl * 0.45);
  } else if (uType < 4.5) { // rocky
    float ridges = abs(fbm(P * 3.2 + sd) - 0.5) * 2.0;
    col = uTint * (0.6 + 0.5 * n2) * (0.8 + 0.35 * ridges);
  } else if (uType < 5.5) { // thin atmosphere
    col = uTint * (0.65 + 0.55 * n2);
  } else if (uType < 6.5) { // gas giant
    float bnd = sin(lat * 16.0 + band * 4.0) * 0.5 + 0.5;
    vec3 c1 = uTint * 0.55;
    vec3 c2 = mix(uTint, vec3(1.0, 0.93, 0.8), 0.45);
    col = mix(c1, c2, bnd);
    col = mix(col, col * 1.18, smoothstep(0.65, 0.85, n1));
    float spot = smoothstep(0.72, 0.82, fbm(P * 2.6 + vec3(1.7, 0.3, 2.1)));
    col = mix(col, vec3(0.85, 0.42, 0.25), spot * 0.55);
  } else if (uType < 7.5) { // icy
    col = mix(uTint, vec3(0.86, 0.93, 1.0), 0.55 + 0.3 * n1);
    float crack = smoothstep(0.48, 0.5, abs(fbm(P * 6.0 + sd) - 0.5));
    col *= 0.88 + 0.2 * crack;
  } else if (uType < 8.5) { // quartz
    col = uTint * (0.7 + 0.4 * n2);
    col = mix(col, vec3(0.95, 0.98, 1.0), smoothstep(0.62, 0.78, n1) * 0.7);
  } else { // substellar
    float bnd = sin(lat * 10.0 + band * 3.0) * 0.5 + 0.5;
    col = mix(uTint * 0.3, vec3(0.55, 0.18, 0.12), bnd);
    col += vec3(0.8, 0.3, 0.1) * smoothstep(0.68, 0.82, n2) * 0.5;
  }

  vec3 L = normalize(uLightDir);
  float shade = 1.0;
  if (uShadowRadius > 0.001) {
    float ang = acos(clamp(dot(L, normalize(uShadowDir)), -1.0, 1.0));
    shade = 1.0 - 0.7 * (1.0 - smoothstep(uShadowRadius * 0.5, uShadowRadius * 1.8, ang));
  }
  float diff = max(dot(n, L), 0.0) * shade;
  vec3 viewDir = normalize(uCamPos - vWorld);
  float rim = pow(1.0 - max(dot(n, viewDir), 0.0), 2.2);
  vec3 outCol = col * (0.1 + 1.05 * pow(diff, 0.9));
  float atmo = 0.0;
  if (uType > 1.5 && uType < 2.5) atmo = 0.9;
  else if (uType > 2.5 && uType < 3.5) atmo = 0.7;
  else if (uType > 4.5 && uType < 5.5) atmo = 0.3;
  else if (uType > 5.5 && uType < 6.5) atmo = 0.9;
  else if (uType > 7.5 && uType < 8.5) atmo = 0.45;
  outCol += mix(vec3(0.25,0.4,0.7), col, 0.55) * rim * atmo * 0.22; // atmosphere limb, airless planets have none
  if (uType > 8.5) outCol += vec3(0.8, 0.35, 0.15) * diff * 0.15;
  outColor = vec4(outCol, uAlpha);
}`

export interface GlobeInstance {
  x: number; y: number; z: number
  radius: number
  r: number; g: number; b: number
  typeIndex: number
  seed: number
  spin: number
  light: [number, number, number]
  a: number
  ring: boolean
  ringInner: number
  ringOuter: number
  ringTilt: number
  shadowDir: [number, number, number]
  shadowRadius: number
}

export interface GlobeRenderer {
  draw(view: Mat4, proj: Mat4, camPos: [number, number, number], instances: GlobeInstance[]): void
}

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const s = gl.createShader(type)!
  gl.shaderSource(s, src)
  gl.compileShader(s)
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || 'shader')
  return s
}

export function createGlobeRenderer(gl: WebGL2RenderingContext): GlobeRenderer {
  const prog = gl.createProgram()!
  gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VS))
  gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FS))
  gl.linkProgram(prog)
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) || 'prog')

  const SEG_X = 40
  const SEG_Y = 20
  const verts = new Float32Array((SEG_X + 1) * (SEG_Y + 1) * 5)
  let vi = 0
  for (let y = 0; y <= SEG_Y; y++) {
    const v = y / SEG_Y
    const lat = (v - 0.5) * Math.PI
    const cl = Math.cos(lat)
    const sl = Math.sin(lat)
    for (let x = 0; x <= SEG_X; x++) {
      const u = x / SEG_X
      const lon = u * Math.PI * 2
      verts[vi++] = cl * Math.cos(lon)
      verts[vi++] = sl
      verts[vi++] = cl * Math.sin(lon)
      verts[vi++] = u
      verts[vi++] = 1 - v
    }
  }
  const index = new Uint16Array(SEG_X * SEG_Y * 6)
  let ii = 0
  for (let y = 0; y < SEG_Y; y++) {
    for (let x = 0; x < SEG_X; x++) {
      const a = y * (SEG_X + 1) + x
      const b = a + 1
      const c = a + SEG_X + 1
      const d = c + 1
      index[ii++] = a; index[ii++] = c; index[ii++] = b
      index[ii++] = b; index[ii++] = c; index[ii++] = d
    }
  }

  const vao = gl.createVertexArray()!
  gl.bindVertexArray(vao)
  const vbo = gl.createBuffer()!
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo)
  gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW)
  gl.enableVertexAttribArray(0)
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 5 * 4, 0)
  gl.enableVertexAttribArray(1)
  gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 5 * 4, 3 * 4)
  const ibo = gl.createBuffer()!
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo)
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, index, gl.STATIC_DRAW)

  const RING_SEG = 64
  const ringVerts = new Float32Array(RING_SEG * 6 * 3)
  let ri = 0
  for (let i = 0; i < RING_SEG; i++) {
    const a0 = (i / RING_SEG) * Math.PI * 2
    const a1 = ((i + 1) / RING_SEG) * Math.PI * 2
    const c0 = Math.cos(a0), s0 = Math.sin(a0)
    const c1 = Math.cos(a1), s1 = Math.sin(a1)
    ringVerts[ri++] = 0; ringVerts[ri++] = 0; ringVerts[ri++] = 0
    ringVerts[ri++] = c0; ringVerts[ri++] = 0; ringVerts[ri++] = s0
    ringVerts[ri++] = c1; ringVerts[ri++] = 0; ringVerts[ri++] = s1
  }
  const ringVao = gl.createVertexArray()!
  gl.bindVertexArray(ringVao)
  const ringVbo = gl.createBuffer()!
  gl.bindBuffer(gl.ARRAY_BUFFER, ringVbo)
  gl.bufferData(gl.ARRAY_BUFFER, ringVerts, gl.STATIC_DRAW)
  gl.enableVertexAttribArray(0)
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 12, 0)
  gl.bindVertexArray(null)
  const ringCount = ringVerts.length / 3

  const uView = gl.getUniformLocation(prog, 'uView')
  const uProj = gl.getUniformLocation(prog, 'uProj')
  const uModel = gl.getUniformLocation(prog, 'uModel')
  const uTint = gl.getUniformLocation(prog, 'uTint')
  const uLightDir = gl.getUniformLocation(prog, 'uLightDir')
  const uCamPos = gl.getUniformLocation(prog, 'uCamPos')
  const uType = gl.getUniformLocation(prog, 'uType')
  const uSeed = gl.getUniformLocation(prog, 'uSeed')
  const uSpin = gl.getUniformLocation(prog, 'uSpin')
  const uAlpha = gl.getUniformLocation(prog, 'uAlpha')
  const uRing = gl.getUniformLocation(prog, 'uRing')
  const uRingInnerFrac = gl.getUniformLocation(prog, 'uRingInnerFrac')
  const uRingColor = gl.getUniformLocation(prog, 'uRingColor')
  const uRingNormal = gl.getUniformLocation(prog, 'uRingNormal')
  const uShadowDir = gl.getUniformLocation(prog, 'uShadowDir')
  const uShadowRadius = gl.getUniformLocation(prog, 'uShadowRadius')
  const model = new Float32Array(16)
  const idxCount = index.length

  function draw(view: Mat4, proj: Mat4, camPos: [number, number, number], instances: GlobeInstance[]): void {
    if (instances.length === 0) return
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight)
    gl.enable(gl.DEPTH_TEST)
    gl.depthFunc(gl.LEQUAL)
    gl.depthMask(true)
    gl.clear(gl.DEPTH_BUFFER_BIT)
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)
    gl.useProgram(prog)
    gl.uniformMatrix4fv(uView, false, view)
    gl.uniformMatrix4fv(uProj, false, proj)
    gl.uniform3fv(uCamPos, camPos)
    gl.bindVertexArray(vao)
    for (const it of instances) {
      const s = it.radius
      model[0] = s; model[1] = 0; model[2] = 0; model[3] = 0
      model[4] = 0; model[5] = s; model[6] = 0; model[7] = 0
      model[8] = 0; model[9] = 0; model[10] = s; model[11] = 0
      model[12] = it.x; model[13] = it.y; model[14] = it.z; model[15] = 1
      gl.uniformMatrix4fv(uModel, false, model)
      gl.uniform3f(uTint, it.r, it.g, it.b)
      gl.uniform3f(uLightDir, it.light[0], it.light[1], it.light[2])
      gl.uniform1f(uType, it.typeIndex)
      gl.uniform1f(uSeed, it.seed)
      gl.uniform1f(uSpin, it.spin)
      gl.uniform1f(uAlpha, it.a)
      gl.uniform1f(uRing, 0)
      gl.uniform3f(uShadowDir, it.shadowDir[0], it.shadowDir[1], it.shadowDir[2])
      gl.uniform1f(uShadowRadius, it.shadowRadius)
      gl.depthMask(it.a >= 0.999)
      gl.drawElements(gl.TRIANGLES, idxCount, gl.UNSIGNED_SHORT, 0)
      if (it.ring && it.a > 0.01) {
        const rs = it.radius * it.ringOuter
        const c = Math.cos(it.ringTilt), sn = Math.sin(it.ringTilt)
        model[0] = rs; model[1] = 0; model[2] = 0; model[3] = 0
        model[4] = 0; model[5] = rs * c; model[6] = rs * sn; model[7] = 0
        model[8] = 0; model[9] = -rs * sn; model[10] = rs * c; model[11] = 0
        model[12] = it.x; model[13] = it.y; model[14] = it.z; model[15] = 1
        gl.uniformMatrix4fv(uModel, false, model)
        gl.uniform1f(uRing, 1)
        gl.uniform1f(uRingInnerFrac, it.ringInner / it.ringOuter)
        gl.uniform3f(uRingColor, it.r * 1.15, it.g * 1.15, it.b * 1.15)
        gl.uniform3f(uRingNormal, 0, c, sn)
        gl.depthMask(false)
        gl.bindVertexArray(ringVao)
        gl.drawArrays(gl.TRIANGLES, 0, ringCount)
        gl.bindVertexArray(vao)
      }
    }
    gl.depthMask(true)
  }

  return { draw }
}
