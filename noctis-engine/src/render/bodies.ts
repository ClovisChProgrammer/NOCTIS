import type { Mat4 } from './math.ts'

const VS = `#version 300 es
layout(location=0) in vec2 aCorner; // -1..1
layout(location=1) in vec3 iPos;
layout(location=2) in float iSize;
layout(location=3) in vec4 iColor; // rgb, alpha/intensity
layout(location=4) in vec4 iParams; // x: typeIndex (0-9 planet, 100+ star class), y: seed, z: kind (0 planet,1 star,2 marker), w: flags

uniform mat4 uView;
uniform mat4 uProj;
uniform vec3 uCamRight;
uniform vec3 uCamUp;

out vec2 vUv;
out vec4 vColor;
out vec4 vParams;

void main(){
  vec3 world = iPos + (uCamRight * aCorner.x + uCamUp * aCorner.y) * iSize;
  gl_Position = uProj * uView * vec4(world,1.0);
  vUv = aCorner * 0.5 + 0.5;
  vColor = iColor;
  vParams = iParams;
}`

const FS = `#version 300 es
precision highp float;
in vec2 vUv;
in vec4 vColor;
in vec4 vParams;
out vec4 outColor;

uniform sampler2D uAtlas; // RGBA8 atlas (32-bit)
uniform float uTime;

float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453123); }
float noise(vec2 p){
  vec2 i=floor(p), f=fract(p);
  float a=hash(i), b=hash(i+vec2(1.,0.)), c=hash(i+vec2(0.,1.)), d=hash(i+vec2(1.,1.));
  vec2 u=f*f*(3.-2.*f);
  return mix(a,b,u.x)+(c-a)*u.y*(1.-u.x)+(d-b)*u.x*u.y;
}
float fbm(vec2 p){
  float v=0., a=0.5;
  for(int i=0;i<5;i++){ v+=a*noise(p); p*=2.02; a*=0.5; }
  return v;
}

void main(){
  vec2 p = vUv*2.0 - 1.0;
  float r = length(p);
  float kind = vParams.z;
  float typeIdx = vParams.x;
  float seed = vParams.y;

  if (kind > 1.5) {
    // marker/ring
    float ring = (1.0 - smoothstep(0.85,0.98,r)) * smoothstep(0.55,0.7,r);
    if (ring < 0.01) discard;
    outColor = vec4(vColor.rgb, ring * vColor.a);
    return;
  }

  if (kind > 0.5) {
    // star/sol: glow + bright core
    if (r > 1.0) discard;
    float core = exp(-r*r*6.0);
    float glow = exp(-r*r*1.8);
    float rays = 0.0;
    float a = atan(p.y,p.x);
    rays = 0.15 * pow(abs(sin(a*8.0 + seed*0.1)), 12.0) * exp(-r*2.5);
    vec3 col = mix(vColor.rgb, vec3(1.0,0.98,0.9), core*0.8);
    float alpha = clamp(glow*0.9 + core*0.7 + rays, 0.0, 1.0);
    outColor = vec4(col, alpha);
    return;
  }

  // planet: sphere shading + procedural detail (32-bit output) modulated by type tint
  if (r > 1.0) discard;
  float z = sqrt(max(0.0, 1.0 - r*r));
  vec3 n = normalize(vec3(p, z));
  vec3 l = normalize(vec3(-0.4, 0.3, 0.85));
  float diff = max(dot(n,l), 0.0);
  float amb = 0.12;
  float rim = pow(1.0 - max(dot(n, vec3(0,0,1)),0.0), 2.0);

  // atlas sample: each type occupies a cell (10 types in a row)
  float cell = 1.0/16.0;
  vec2 auv = vec2((mod(typeIdx,16.0)+vUv.x)*cell, (floor(typeIdx/16.0)+vUv.y)*cell);
  vec3 tex = texture(uAtlas, auv).rgb;

  // procedural detail layered on top for higher-res look
  float lat = asin(clamp(n.y,-1.,1.));
  float lon = atan(n.z,n.x);
  vec2 sp = vec2(lon*1.2, lat*2.0) + seed*0.01;
  float bands = fbm(sp*vec2(3.0,1.2) + vec2(0.0, seed));
  float spots = fbm(sp*6.0 + 10.0);
  vec3 detail = mix(tex, tex* (0.7 + 0.6*bands), 0.55);
  detail = mix(detail, detail*(0.85 + 0.3*spots), 0.35);

  // type-specific tweaks
  if (typeIdx > 5.5 && typeIdx < 6.5) { // gas giant bands
    detail *= 0.85 + 0.35*sin(lat*18.0 + bands*3.0);
  } else if (typeIdx > 2.5 && typeIdx < 3.5) { // life/world
    detail = mix(detail, vec3(0.15,0.35,0.7), smoothstep(0.45,0.55,bands)*0.4);
    detail = mix(detail, vec3(0.2,0.5,0.2), (1.0-smoothstep(0.45,0.6,bands))*0.25);
  } else if (typeIdx > 6.5 && typeIdx < 7.5) { // icy
    detail = mix(detail, vec3(0.85,0.92,1.0), 0.35);
  } else if (typeIdx < 0.5) { // hot
    detail = mix(detail, vec3(1.0,0.4,0.15), 0.25*bands);
  }

  vec3 col = detail * vColor.rgb * (amb + 0.95*diff);
  float atmo = 0.0;
  if (typeIdx > 1.5 && typeIdx < 2.5) atmo = 0.9;
  else if (typeIdx > 2.5 && typeIdx < 3.5) atmo = 0.7;
  else if (typeIdx > 4.5 && typeIdx < 5.5) atmo = 0.35;
  else if (typeIdx > 5.5 && typeIdx < 6.5) atmo = 1.0;
  else if (typeIdx > 7.5 && typeIdx < 8.5) atmo = 0.5;
  col += vec3(0.25,0.35,0.6) * rim * atmo * 0.22; // atmosphere rim only where there is air
  col = pow(col, vec3(0.95)); // slight lift
  float alpha = (1.0 - smoothstep(0.985, 1.0, r)) * vColor.a;
  outColor = vec4(col, alpha);
}`

export interface BodyInstance {
  x:number;y:number;z:number; size:number; r:number;g:number;b:number;a:number; typeIndex:number; seed:number; kind:number; flags:number
}

export interface BodiesRenderer {
  draw(view: Mat4, proj: Mat4, camRight:[number,number,number], camUp:[number,number,number], instances: BodyInstance[], time:number): void
  atlas: WebGLTexture
}

function compile(gl:WebGL2RenderingContext, type:number, src:string){
  const s=gl.createShader(type)!; gl.shaderSource(s,src); gl.compileShader(s);
  if(!gl.getShaderParameter(s,gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)||'shader')
  return s
}

export function createBodiesRenderer(gl:WebGL2RenderingContext, atlasTex: WebGLTexture): BodiesRenderer {
  const prog = gl.createProgram()!
  gl.attachShader(prog, compile(gl,gl.VERTEX_SHADER,VS))
  gl.attachShader(prog, compile(gl,gl.FRAGMENT_SHADER,FS))
  gl.linkProgram(prog)
  if(!gl.getProgramParameter(prog,gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog)||'prog')

  const vao = gl.createVertexArray()!
  gl.bindVertexArray(vao)

  // quad corners
  const corners = new Float32Array([-1,-1, 1,-1, -1,1, -1,1, 1,-1, 1,1])
  const cornerBuf = gl.createBuffer()!
  gl.bindBuffer(gl.ARRAY_BUFFER, cornerBuf)
  gl.bufferData(gl.ARRAY_BUFFER, corners, gl.STATIC_DRAW)
  gl.enableVertexAttribArray(0)
  gl.vertexAttribPointer(0,2,gl.FLOAT,false,0,0)

  const instBuf = gl.createBuffer()!
  gl.bindBuffer(gl.ARRAY_BUFFER, instBuf)
  gl.bufferData(gl.ARRAY_BUFFER, 4096 * 13 * 4, gl.DYNAMIC_DRAW)
  const stride = 13*4
  let loc=1; let off=0
  const attrib = (size:number)=>{ gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc,size,gl.FLOAT,false,stride,off); gl.vertexAttribDivisor(loc,1); loc++; off+=size*4 }
  attrib(3) // pos
  attrib(1) // size
  attrib(4) // color
  attrib(4) // params

  const uView=gl.getUniformLocation(prog,'uView')
  const uProj=gl.getUniformLocation(prog,'uProj')
  const uCamRight=gl.getUniformLocation(prog,'uCamRight')
  const uCamUp=gl.getUniformLocation(prog,'uCamUp')
  const uAtlas=gl.getUniformLocation(prog,'uAtlas')
  const uTime=gl.getUniformLocation(prog,'uTime')

  const data = new Float32Array(4096*13)

  function draw(view:Mat4, proj:Mat4, camRight:[number,number,number], camUp:[number,number,number], instances: BodyInstance[], time:number){
    if(instances.length===0) return
    let n=0
    for(let i=0;i<instances.length && i<4096;i++){
      const it=instances[i]; const b=i*13
      data[b]=it.x; data[b+1]=it.y; data[b+2]=it.z; data[b+3]=it.size
      data[b+4]=it.r; data[b+5]=it.g; data[b+6]=it.b; data[b+7]=it.a
      data[b+8]=it.typeIndex; data[b+9]=it.seed; data[b+10]=it.kind; data[b+11]=it.flags; data[b+12]=0
      n++
    }
    gl.useProgram(prog)
    gl.bindVertexArray(vao)
    gl.bindBuffer(gl.ARRAY_BUFFER, instBuf)
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, data.subarray(0,n*13))
    gl.disable(gl.DEPTH_TEST)
    gl.uniformMatrix4fv(uView,false,view)
    gl.uniformMatrix4fv(uProj,false,proj)
    gl.uniform3fv(uCamRight,camRight)
    gl.uniform3fv(uCamUp,camUp)
    gl.uniform1i(uAtlas,0)
    gl.uniform1f(uTime,time)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, atlasTex)
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)
    gl.drawArraysInstanced(gl.TRIANGLES,0,6,n)
  }

  return { draw, atlas: atlasTex }
}
