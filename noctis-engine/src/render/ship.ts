import type { Mat4 } from './math.ts'

type Vec3 = [number, number, number]

export type ShipRenderer = {
  draw(view: Mat4, proj: Mat4, pos: Vec3, dir: Vec3, right: Vec3, up: Vec3, time: number, scale: number): void
}

const VERTEX_SRC = `#version 300 es
precision highp float;
layout(location = 0) in vec3 aPos;
layout(location = 1) in vec3 aColor;
layout(location = 2) in float aGlow;
uniform mat4 uView;
uniform mat4 uProj;
uniform mat4 uModel;
out vec3 vColor;
out float vGlow;
void main() {
  vColor = aColor;
  vGlow = aGlow;
  gl_Position = uProj * uView * uModel * vec4(aPos, 1.0);
}`

const FRAGMENT_SRC = `#version 300 es
precision highp float;
in vec3 vColor;
in float vGlow;
uniform float uPulse;
out vec4 fragColor;
void main() {
  fragColor = vec4(vColor * (1.0 + vGlow * uPulse), 1.0);
}`

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const shader = gl.createShader(type)!
  gl.shaderSource(shader, src)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(shader) || 'ship shader failed')
  }
  return shader
}

export function createShipRenderer(gl: WebGL2RenderingContext): ShipRenderer {
  const program = gl.createProgram()!
  gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERTEX_SRC))
  gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAGMENT_SRC))
  gl.linkProgram(program)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(program) || 'ship program failed')
  }

  const data: number[] = []
  const hull: Vec3 = [0.40, 0.54, 0.72]
  const dark: Vec3 = [0.14, 0.22, 0.36]
  const wing: Vec3 = [0.32, 0.45, 0.64]
  const fin: Vec3 = [0.48, 0.62, 0.80]
  const canopy: Vec3 = [0.22, 0.78, 0.96]
  const engine: Vec3 = [1.0, 0.58, 0.22]

  const tri = (a: Vec3, b: Vec3, c: Vec3, color: Vec3, glow = 0): void => {
    for (const p of [a, b, c]) data.push(p[0], p[1], p[2], color[0], color[1], color[2], glow)
  }
  const quad = (a: Vec3, b: Vec3, c: Vec3, d: Vec3, color: Vec3, glow = 0): void => {
    tri(a, b, c, color, glow)
    tri(a, c, d, color, glow)
  }

  const ftl: Vec3 = [-0.34, 0.20, -1.8]
  const ftr: Vec3 = [0.34, 0.20, -1.8]
  const fbl: Vec3 = [-0.34, -0.20, -1.8]
  const fbr: Vec3 = [0.34, -0.20, -1.8]
  const btl: Vec3 = [-0.26, 0.16, 1.3]
  const btr: Vec3 = [0.26, 0.16, 1.3]
  const bbl: Vec3 = [-0.26, -0.16, 1.3]
  const bbr: Vec3 = [0.26, -0.16, 1.3]
  quad(ftl, ftr, btr, btl, hull)
  quad(fbl, bbl, bbr, fbr, dark)
  quad(ftl, btl, bbl, fbl, hull)
  quad(ftr, fbr, bbr, btr, hull)

  const nose: Vec3 = [0, 0, -2.9]
  tri(ftl, ftr, nose, hull)
  tri(fbr, fbl, nose, hull)
  tri(ftl, nose, fbl, dark)
  tri(ftr, fbr, nose, dark)
  quad(btl, btr, bbr, bbl, dark)

  tri([-0.30, -0.02, -0.5], [-1.9, -0.02, 0.7], [-0.30, -0.02, 1.1], wing)
  tri([0.30, -0.02, -0.5], [0.30, -0.02, 1.1], [1.9, -0.02, 0.7], wing)
  tri([0, 0.16, 0.6], [0, 1.15, 1.25], [0, 0.16, 1.35], fin)
  quad([-0.16, 0.205, -1.2], [0.16, 0.205, -1.2], [0.12, 0.205, -0.2], [-0.12, 0.205, -0.2], canopy)
  quad([-0.20, -0.13, 1.36], [0.20, -0.13, 1.36], [0.20, 0.13, 1.36], [-0.20, 0.13, 1.36], engine, 1)

  const vao = gl.createVertexArray()!
  gl.bindVertexArray(vao)
  const vbo = gl.createBuffer()!
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW)
  gl.enableVertexAttribArray(0)
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 28, 0)
  gl.enableVertexAttribArray(1)
  gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 28, 12)
  gl.enableVertexAttribArray(2)
  gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 28, 24)
  gl.bindVertexArray(null)
  const count = data.length / 7

  const uView = gl.getUniformLocation(program, 'uView')
  const uProj = gl.getUniformLocation(program, 'uProj')
  const uModel = gl.getUniformLocation(program, 'uModel')
  const uPulse = gl.getUniformLocation(program, 'uPulse')
  const model = new Float32Array(16)

  return {
    draw(view, proj, pos, dir, right, up, time, scale) {
      const s = Math.max(0.001, scale)
      model[0] = right[0] * s
      model[1] = right[1] * s
      model[2] = right[2] * s
      model[3] = 0
      model[4] = up[0] * s
      model[5] = up[1] * s
      model[6] = up[2] * s
      model[7] = 0
      model[8] = -dir[0] * s
      model[9] = -dir[1] * s
      model[10] = -dir[2] * s
      model[11] = 0
      model[12] = pos[0]
      model[13] = pos[1]
      model[14] = pos[2]
      model[15] = 1

      gl.useProgram(program)
      gl.bindVertexArray(vao)
      gl.disable(gl.DEPTH_TEST)
      gl.enable(gl.BLEND)
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)
      gl.uniformMatrix4fv(uView, false, view)
      gl.uniformMatrix4fv(uProj, false, proj)
      gl.uniformMatrix4fv(uModel, false, model)
      gl.uniform1f(uPulse, 0.35 + 0.25 * (0.5 + 0.5 * Math.sin(time * 7)))
      gl.drawArrays(gl.TRIANGLES, 0, count)
      gl.disable(gl.BLEND)
      gl.bindVertexArray(null)
    },
  }
}
