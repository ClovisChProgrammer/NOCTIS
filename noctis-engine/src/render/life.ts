import type { Mat4 } from './math.ts'

const VS = `#version 300 es
layout(location=0) in vec2 aCorner;
layout(location=1) in vec3 iPos;
layout(location=2) in vec3 iSize;
layout(location=3) in vec4 iColor;
uniform mat4 uView;
uniform mat4 uProj;
uniform vec3 uRight;
uniform float uTime;
uniform float uWind;
out vec2 vUv;
out vec3 vColor;
out float vSeed;
out float vKind;
void main(){
  float kind = iSize.z;
  float seed = iColor.w;
  vec3 pos = iPos + uRight * (aCorner.x * iSize.x * 0.5) + vec3(0.0, aCorner.y * iSize.y, 0.0);
  if (kind > 0.5 && kind < 1.5) {
    float bob = abs(sin(uTime * 6.5 + seed * 25.0)) * 0.08;
    pos.y += bob * aCorner.y;
  } else {
    float amp = kind > 3.5 ? 0.10 : (kind > 0.5 ? 0.07 : 0.05);
    float sway = sin(uTime * 1.4 + seed * 40.0) * (amp + uWind * 0.12) * aCorner.y;
    pos += uRight * sway * iSize.x;
  }
  gl_Position = uProj * uView * vec4(pos, 1.0);
  vUv = vec2(aCorner.x, aCorner.y);
  vColor = iColor.rgb;
  vSeed = seed;
  vKind = kind;
}`

const FS = `#version 300 es
precision highp float;
in vec2 vUv;
in vec3 vColor;
in float vSeed;
in float vKind;
uniform float uTime;
out vec4 outColor;

void main(){
  float x = vUv.x;
  float y = vUv.y;
  float a = 0.0;
  vec3 col = vColor;
  if (vKind < 0.5) {
    float s = vSeed;
    float trunkH = 0.55 + 0.22 * fract(s * 7.13);
    float trunkW = 0.05 + 0.035 * fract(s * 3.31);
    float trunk = step(abs(x), trunkW * (1.0 - y * 0.6)) * step(y, trunkH);
    float cy = 0.52 + 0.26 * fract(s * 5.71);
    float b1 = 1.0 - smoothstep(0.20, 0.33, length(vec2(x * 1.35, (y - cy) * 1.05)));
    float b2 = 1.0 - smoothstep(0.14, 0.26, length(vec2((x - 0.24) * 1.6, (y - cy + 0.14) * 1.35)));
    float b3 = 1.0 - smoothstep(0.14, 0.26, length(vec2((x + 0.24) * 1.6, (y - cy + 0.10) * 1.35)));
    float canopy = max(b1, max(b2, b3));
    a = max(trunk, canopy);
    col *= 1.12;
    col *= 0.72 + 0.34 * y;
    if (canopy > trunk) col *= 0.85 + 0.30 * fract(s * 11.7);
    else col *= 0.55;
  } else if (vKind < 1.5) {
    float s = vSeed;
    float body = 1.0 - smoothstep(0.30, 0.40, length(vec2(x * 1.55, (y - 0.46) * 1.35)));
    float head = 1.0 - smoothstep(0.15, 0.21, length(vec2((x - 0.34) * 2.1, (y - 0.70) * 2.0)));
    float swing = sin(uTime * 8.0 + s * 30.0) * 0.05;
    float leg1 = step(abs(x - (-0.18 + swing)), 0.028) * step(0.12, y) * step(y, 0.34);
    float leg2 = step(abs(x - (0.18 - swing)), 0.028) * step(0.12, y) * step(y, 0.34);
    float leg3 = step(abs(x - (-0.34 - swing)), 0.026) * step(0.10, y) * step(y, 0.30);
    float leg4 = step(abs(x - (0.34 + swing)), 0.026) * step(0.10, y) * step(y, 0.30);
    a = max(max(body, head), max(max(leg1, leg2), max(leg3, leg4)));
    col *= 0.80 + 0.30 * y;
    float eye = step(length(vec2((x - 0.40) * 6.0, (y - 0.74) * 6.0)), 0.35);
    col = mix(col, vec3(1.0, 0.92, 0.55), eye * 0.8);
  } else if (vKind < 2.5) {
    float s = vSeed;
    float trunkW = 0.035 + 0.020 * fract(s * 3.1);
    float trunk = step(abs(x), trunkW) * step(y, 0.88);
    float layers = 0.0;
    for (int i = 0; i < 3; i++) {
      float fi = float(i);
      float yy = 0.30 + fi * 0.20;
      float hw = 0.38 - fi * 0.075;
      float tri = step(yy, y) * step(y, yy + 0.34) * step(abs(x), hw * (1.0 - (y - yy) / 0.34));
      layers = max(layers, tri);
    }
    a = max(trunk, layers);
    col *= 0.62 + 0.30 * y;
    col *= 0.82 + 0.26 * fract(s * 9.1);
  } else if (vKind < 3.5) {
    float s = vSeed;
    float b1 = 1.0 - smoothstep(0.22, 0.34, length(vec2(x * 1.5, (y - 0.35) * 1.2)));
    float b2 = 1.0 - smoothstep(0.16, 0.28, length(vec2((x - 0.26) * 1.8, (y - 0.46) * 1.5)));
    float b3 = 1.0 - smoothstep(0.16, 0.28, length(vec2((x + 0.25) * 1.8, (y - 0.42) * 1.5)));
    a = max(b1, max(b2, b3));
    col *= 0.80 + 0.25 * y;
    col *= 0.86 + 0.24 * fract(s * 13.7);
  } else {
    float s = vSeed;
    float blades = 0.0;
    for (int i = 0; i < 5; i++) {
      float fi = float(i);
      float bx = (fi - 2.0) * 0.16;
      float lean = (fract(s * 7.3 + fi * 0.37) - 0.5) * 0.22;
      float w = 0.018 + 0.012 * fract(s * 3.1 + fi);
      float tip = 0.55 + 0.35 * fract(s * 5.7 + fi);
      float blade = step(abs(x - (bx + lean * y)), w * (1.0 - y * 0.45)) * step(y, tip);
      blades = max(blades, blade);
    }
    a = blades;
    col *= 0.65 + 0.35 * y;
    col *= 0.90 + 0.20 * fract(s * 11.0);
  }
  if (a < 0.40) discard;
  outColor = vec4(col, 1.0);
}`

export interface LifeItem {
  x: number
  y: number
  z: number
  w: number
  h: number
  kind: number
  r: number
  g: number
  b: number
  seed: number
}

export interface LifeRenderer {
  draw(view: Mat4, proj: Mat4, items: LifeItem[], right: [number, number, number], time: number, wind?: number): void
}

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const s = gl.createShader(type)!
  gl.shaderSource(s, src)
  gl.compileShader(s)
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || 'shader')
  return s
}

export function createLifeRenderer(gl: WebGL2RenderingContext): LifeRenderer {
  const prog = gl.createProgram()!
  gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VS))
  gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FS))
  gl.linkProgram(prog)
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) || 'prog')

  const vao = gl.createVertexArray()!
  gl.bindVertexArray(vao)

  const cornerVbo = gl.createBuffer()!
  gl.bindBuffer(gl.ARRAY_BUFFER, cornerVbo)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, 0, 1, 0, -1, 1, 1, 1]), gl.STATIC_DRAW)
  gl.enableVertexAttribArray(0)
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 8, 0)

  const instVbo = gl.createBuffer()!
  gl.bindBuffer(gl.ARRAY_BUFFER, instVbo)
  const STRIDE = 10 * 4
  gl.enableVertexAttribArray(1)
  gl.vertexAttribPointer(1, 3, gl.FLOAT, false, STRIDE, 0)
  gl.vertexAttribDivisor(1, 1)
  gl.enableVertexAttribArray(2)
  gl.vertexAttribPointer(2, 3, gl.FLOAT, false, STRIDE, 12)
  gl.vertexAttribDivisor(2, 1)
  gl.enableVertexAttribArray(3)
  gl.vertexAttribPointer(3, 4, gl.FLOAT, false, STRIDE, 24)
  gl.vertexAttribDivisor(3, 1)
  gl.bindVertexArray(null)

  const uView = gl.getUniformLocation(prog, 'uView')
  const uProj = gl.getUniformLocation(prog, 'uProj')
  const uRight = gl.getUniformLocation(prog, 'uRight')
  const uTime = gl.getUniformLocation(prog, 'uTime')
  const uWind = gl.getUniformLocation(prog, 'uWind')

  let buf = new Float32Array(0)

  function draw(view: Mat4, proj: Mat4, items: LifeItem[], right: [number, number, number], time: number, wind = 0): void {
    if (!items.length) return
    if (buf.length < items.length * 10) buf = new Float32Array(items.length * 10)
    let o = 0
    for (const it of items) {
      buf[o++] = it.x
      buf[o++] = it.y
      buf[o++] = it.z
      buf[o++] = it.w
      buf[o++] = it.h
      buf[o++] = it.kind
      buf[o++] = it.r
      buf[o++] = it.g
      buf[o++] = it.b
      buf[o++] = it.seed
    }
    const rl = Math.hypot(right[0], right[2]) || 1

    gl.disable(gl.BLEND)
    gl.enable(gl.DEPTH_TEST)
    gl.depthFunc(gl.LEQUAL)
    gl.depthMask(true)
    gl.useProgram(prog)
    gl.uniformMatrix4fv(uView, false, view)
    gl.uniformMatrix4fv(uProj, false, proj)
    gl.uniform3f(uRight, right[0] / rl, 0, right[2] / rl)
    gl.uniform1f(uTime, time)
    gl.uniform1f(uWind, wind)
    gl.bindVertexArray(vao)
    gl.bindBuffer(gl.ARRAY_BUFFER, instVbo)
    gl.bufferData(gl.ARRAY_BUFFER, buf.subarray(0, items.length * 10), gl.DYNAMIC_DRAW)
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, items.length)
    gl.bindVertexArray(null)
  }

  return { draw }
}
