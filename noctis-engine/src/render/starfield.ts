import type { Mat4 } from './math.ts'

const VERTEX_SRC = `#version 300 es
layout(location = 0) in vec3 aPos;
layout(location = 1) in float aSize;
layout(location = 2) in vec3 aColor;
uniform mat4 uView;
uniform mat4 uProj;
uniform float uPointScale;
out float vDepth;
out vec3 vColor;
void main() {
  vec4 vp = uView * vec4(aPos, 1.0);
  vDepth = -vp.z;
  vColor = aColor;
  gl_Position = uProj * vp;
  float depth = max(vDepth, 0.2);
  float ps = (uPointScale * aSize) / depth;
  if (depth < 60.0) ps *= mix(4.0, 1.0, depth / 60.0);
  gl_PointSize = clamp(ps, 1.2, 140.0);
}`

const FRAGMENT_SRC = `#version 300 es
precision highp float;
in float vDepth;
in vec3 vColor;
out vec4 outColor;
void main() {
  vec2 d = gl_PointCoord - vec2(0.5);
  float r2 = dot(d, d);
  if (r2 > 0.25) discard;
  float core = smoothstep(0.06, 0.0, r2);
  float glow = smoothstep(0.25, 0.0, r2);
  float fade = clamp(1.0 - vDepth / 9000.0, 0.12, 1.0);
  vec3 col = mix(vColor, vec3(1.0), core * 0.85);
  outColor = vec4(col, glow) * fade;
}`

export interface Starfield {
  draw(view: Mat4, proj: Mat4, pointScale: number, overlays?: Float32Array, overlayCount?: number): void
  count: number
}

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const shader = gl.createShader(type)!
  gl.shaderSource(shader, src)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(`shader: ${gl.getShaderInfoLog(shader)}`)
  }
  return shader
}

// stars interleaved: [x,y,z,size,r,g,b] * N
export function createStarfield(gl: WebGL2RenderingContext, stars: Float32Array): Starfield {
  const prog = gl.createProgram()!
  gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERTEX_SRC))
  gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FRAGMENT_SRC))
  gl.linkProgram(prog)
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    throw new Error(`program: ${gl.getProgramInfoLog(prog)}`)
  }

  const stride = 7 * 4
  const vao = gl.createVertexArray()!
  gl.bindVertexArray(vao)
  const buffer = gl.createBuffer()!
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
  gl.bufferData(gl.ARRAY_BUFFER, stars, gl.STATIC_DRAW)
  gl.enableVertexAttribArray(0)
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, stride, 0)
  gl.enableVertexAttribArray(1)
  gl.vertexAttribPointer(1, 1, gl.FLOAT, false, stride, 3 * 4)
  gl.enableVertexAttribArray(2)
  gl.vertexAttribPointer(2, 3, gl.FLOAT, false, stride, 4 * 4)

  const dynVao = gl.createVertexArray()!
  gl.bindVertexArray(dynVao)
  const dynBuffer = gl.createBuffer()!
  gl.bindBuffer(gl.ARRAY_BUFFER, dynBuffer)
  gl.bufferData(gl.ARRAY_BUFFER, 4096 * stride, gl.DYNAMIC_DRAW)
  gl.enableVertexAttribArray(0)
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, stride, 0)
  gl.enableVertexAttribArray(1)
  gl.vertexAttribPointer(1, 1, gl.FLOAT, false, stride, 3 * 4)
  gl.enableVertexAttribArray(2)
  gl.vertexAttribPointer(2, 3, gl.FLOAT, false, stride, 4 * 4)

  const uView = gl.getUniformLocation(prog, 'uView')
  const uProj = gl.getUniformLocation(prog, 'uProj')
  const uPointScale = gl.getUniformLocation(prog, 'uPointScale')
  const count = stars.length / 7

  function draw(view: Mat4, proj: Mat4, pointScale: number, overlays?: Float32Array, overlayCount?: number): void {
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight)
    gl.clearColor(0.008, 0.009, 0.016, 1)
    gl.clear(gl.COLOR_BUFFER_BIT)
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE)
    gl.useProgram(prog)
    gl.uniformMatrix4fv(uView, false, view)
    gl.uniformMatrix4fv(uProj, false, proj)
    gl.uniform1f(uPointScale, pointScale)
    gl.bindVertexArray(vao)
    gl.drawArrays(gl.POINTS, 0, count)
    if (overlays && overlayCount && overlayCount > 0) {
      gl.bindVertexArray(dynVao)
      gl.bindBuffer(gl.ARRAY_BUFFER, dynBuffer)
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, overlays.subarray(0, overlayCount * 7))
      gl.drawArrays(gl.POINTS, 0, overlayCount)
    }
  }

  return { draw, count }
}
