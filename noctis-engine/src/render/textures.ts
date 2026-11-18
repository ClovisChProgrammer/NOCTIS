export interface TextureAtlas {
  texture: WebGLTexture
  cellSize: number
  cols: number
}

function clamp01(v:number){ return Math.min(1, Math.max(0,v)) }
function lerp(a:number,b:number,t:number){ return a + (b-a)*t }

// simple value noise in JS for texture generation
function hash2(x:number,y:number,seed:number){
  let n = Math.sin(x*127.1 + y*311.7 + seed*74.7) * 43758.5453
  return n - Math.floor(n)
}
function noise2(x:number,y:number,seed:number){
  const xi=Math.floor(x), yi=Math.floor(y)
  const xf=x-xi, yf=y-yi
  const u=xf*xf*(3-2*xf), v=yf*yf*(3-2*yf)
  const a=hash2(xi,yi,seed), b=hash2(xi+1,yi,seed), c=hash2(xi,yi+1,seed), d=hash2(xi+1,yi+1,seed)
  return lerp(lerp(a,b,u), lerp(c,d,u), v)
}
function fbm(x:number,y:number,seed:number,oct=5){
  let v=0, a=0.5, f=1
  for(let i=0;i<oct;i++){ v+=a*noise2(x*f,y*f,seed+i*17.3); f*=2.03; a*=0.5 }
  return v
}

function typeBaseColor(type:number): [number,number,number] {
  // improved 32-bit palette inspired by catalog (brighter, richer)
  switch(type){
    case 0: return [0.95,0.42,0.18] // hot/unstable
    case 1: return [0.55,0.52,0.48] // dusty/cratered
    case 2: return [0.78,0.82,0.86] // cloudy thick
    case 3: return [0.22,0.55,0.95] // life/felisian
    case 4: return [0.62,0.48,0.38] // rocky creased
    case 5: return [0.72,0.58,0.42] // thin atmosphere
    case 6: return [0.88,0.72,0.45] // gas giant
    case 7: return [0.78,0.88,0.98] // icy
    case 8: return [0.82,0.78,0.70] // quartz/oxygen
    case 9: return [0.85,0.35,0.18] // substellar
    default:return [0.7,0.7,0.7]
  }
}

function paintPlanetType(data:Uint8ClampedArray, size:number, ox:number, oy:number, atlasW:number, type:number){
  const base = typeBaseColor(type)
  for(let y=0;y<size;y++){
    for(let x=0;x<size;x++){
      const u=x/size, v=y/size
      const nx=(u-0.5)*2, ny=(v-0.5)*2
      const r=Math.sqrt(nx*nx+ny*ny)
      const seed = type*101.7
      let c:[number,number,number] = [base[0],base[1],base[2]]
      const n1 = fbm(u*6, v*6, seed)
      const n2 = fbm(u*14+10, v*14+3, seed+7.1)
      const bands = Math.sin((v*18 + n1*2.0) * Math.PI)
      if(type===6){ // gas giant
        const b = 0.6 + 0.4*bands
        c=[base[0]*b + 0.15*n2, base[1]*(0.85+0.25*bands), base[2]*(0.7+0.2*n1)]
      } else if(type===3){ // life
        const ocean = n1 < 0.48
        c = ocean ? [0.08,0.25+0.25*n2,0.55+0.35*n1] : [0.18+0.25*n2,0.42+0.25*n1,0.12]
        if(n1>0.72) c=[0.85,0.9,0.95] // ice caps/clouds hint
        // clouds
        const cl = fbm(u*8+20,v*5,seed+3)
        if(cl>0.62) c=[lerp(c[0],1,0.55), lerp(c[1],1,0.55), lerp(c[2],1,0.55)]
      } else if(type===7){ // icy
        c=[0.75+0.2*n2,0.85+0.12*n1,0.95]
        c=[c[0]*(0.9+0.2*n1),c[1],c[2]]
      } else if(type===2){ // thick clouds
        const cl = fbm(u*10,v*10,seed)
        c=[0.75+0.2*cl,0.78+0.18*cl,0.82+0.15*n2]
      } else if(type===0){ // hot
        c=[0.8+0.2*n2,0.25+0.35*n1,0.08+0.1*n2]
        if(n1>0.6) c=[1.0,0.7+0.3*n2,0.2]
      } else if(type===1){ // cratered
        const cr = Math.pow(n2,3)
        c=[base[0]*(0.7+0.5*n1-cr*0.4), base[1]*(0.7+0.5*n1-cr*0.4), base[2]*(0.7+0.5*n1-cr*0.3)]
      } else if(type===8){ // quartz
        c=[0.75+0.2*n1,0.72+0.2*n2,0.6+0.25*n1]
      } else if(type===4){ // rocky creased
        const ridge = Math.abs(bands)
        c=[base[0]*(0.7+0.5*n1-0.2*ridge), base[1]*(0.7+0.4*n2), base[2]*(0.7+0.3*n1)]
      } else if(type===5){ // thin atm
        c=[base[0]*(0.8+0.4*n1), base[1]*(0.7+0.4*n2), base[2]*(0.55+0.35*n1)]
      } else if(type===9){ // substellar
        const b = 0.5 + 0.5*bands
        c=[0.7+0.3*n2,0.25+0.35*b,0.08+0.15*n1]
      }
      // subtle limb darkening baked
      const limb = 1.0 - 0.25*Math.pow(Math.min(1,r),1.5)
      const idx = ((oy+y)*atlasW + (ox+x))*4
      data[idx]=Math.round(clamp01(c[0]*limb)*255)
      data[idx+1]=Math.round(clamp01(c[1]*limb)*255)
      data[idx+2]=Math.round(clamp01(c[2]*limb)*255)
      data[idx+3]= r<=1 ? 255 : 0
    }
  }
}

function paintStarCell(data:Uint8ClampedArray, size:number, ox:number, oy:number, atlasW:number, idxCell:number){
  // a few star glow styles (class buckets) in extra cells 10..13
  const cols:[[number,number,number],[number,number,number]][] = [
    [[1.0,0.95,0.8],[1.0,0.7,0.3]],
    [[0.9,0.95,1.0],[0.6,0.8,1.0]],
    [[1.0,0.85,0.85],[1.0,0.5,0.4]],
    [[0.9,1.0,0.9],[0.6,1.0,0.7]],
  ]
  const cset = cols[(idxCell-10)%cols.length]
  for(let y=0;y<size;y++) for(let x=0;x<size;x++){
    const u=x/size, v=y/size, nx=(u-0.5)*2, ny=(v-0.5)*2
    const r=Math.sqrt(nx*nx+ny*ny)
    const t = Math.exp(-r*r*2.2)
    const core = Math.exp(-r*r*8)
    const cr = lerp(cset[1][0], cset[0][0], core)
    const cg = lerp(cset[1][1], cset[0][1], core)
    const cb = lerp(cset[1][2], cset[0][2], core)
    const i = ((oy+y)*atlasW + (ox+x))*4
    data[i]=Math.round(clamp01(cr*(0.5+0.5*t))*255)
    data[i+1]=Math.round(clamp01(cg*(0.5+0.5*t))*255)
    data[i+2]=Math.round(clamp01(cb*(0.5+0.5*t))*255)
    data[i+3]=Math.round(clamp01(t)*255)
  }
}

export function createPlanetAtlas(gl:WebGL2RenderingContext): TextureAtlas {
  const cellSize = 128
  const cols = 16, rows = 1
  const w = cellSize*cols, h = cellSize*rows
  const data = new Uint8ClampedArray(w*h*4)
  for(let t=0;t<=9;t++) paintPlanetType(data, cellSize, t*cellSize, 0, w, t)
  for(let s=10;s<=13;s++) paintStarCell(data, cellSize, s*cellSize, 0, w, s)

  const tex = gl.createTexture()!
  gl.bindTexture(gl.TEXTURE_2D, tex)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, data) // 32-bit RGBA
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  gl.generateMipmap(gl.TEXTURE_2D)
  return { texture: tex, cellSize, cols }
}
