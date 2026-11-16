const http = require('node:http')
const fs = require('node:fs')
const path = require('node:path')

const PW = 'C:/Users/clovi/AppData/Roaming/npm/node_modules/n8n/node_modules/playwright'
const { chromium } = require(PW)

const DIST = path.resolve(__dirname, '..', 'dist')

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.bin': 'application/octet-stream',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
}

function createServer() {
  return http.createServer((req, res) => {
    const urlPath = decodeURIComponent((req.url || '/').split('?')[0])
    let rel = urlPath === '/' ? '/index.html' : urlPath
    const file = path.join(DIST, rel)
    if (!file.startsWith(DIST)) {
      res.writeHead(403)
      res.end('forbidden')
      return
    }
    fs.readFile(file, (err, data) => {
      if (err) {
        res.writeHead(404)
        res.end('not found')
        return
      }
      res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' })
      res.end(data)
    })
  })
}

async function main() {
  const server = createServer()
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const addr = server.address()
  const base = `http://127.0.0.1:${addr.port}`
  console.log('serving', DIST, 'at', base)

  const candidates = [
    'C:/Users/clovi/AppData/Local/ms-playwright/chromium-1248/chrome-win64/chrome.exe',
    'C:/Users/clovi/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe',
  ]
  const executablePath = candidates.find((p) => fs.existsSync(p))
  console.log('using chrome:', executablePath)

  const browser = await chromium.launch({
    headless: true,
    executablePath,
    args: [
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
      '--ignore-gpu-blocklist',
      '--enable-webgl',
    ],
  })
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })

  const logs = []
  page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`))
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`))
  page.on('requestfailed', (r) => logs.push(`[requestfailed] ${r.url()} ${r.failure()?.errorText}`))

  await page.goto(base + '/', { waitUntil: 'load', timeout: 30000 })

  let hudText = ''
  try {
    await page.waitForFunction(
      () => (document.querySelector('#hud')?.textContent || '').includes('estrelas'),
      { timeout: 30000 },
    )
    hudText = await page.evaluate(() => document.querySelector('#hud').textContent)
  } catch (e) {
    logs.push('[wait] HUD nao ficou pronta: ' + e.message)
  }

  await page.waitForTimeout(700)

  const glInfo = await page.evaluate(() => {
    const c = document.querySelector('#view')
    if (!c) return { error: 'sem canvas' }
    const gl = c.getContext('webgl2')
    if (!gl) return { error: 'sem webgl2' }
    const w = gl.drawingBufferWidth
    const h = gl.drawingBufferHeight
    const px = new Uint8Array(w * h * 4)
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px)
    let lit = 0
    let maxSum = 0
    for (let i = 0; i < px.length; i += 4) {
      const s = px[i] + px[i + 1] + px[i + 2]
      if (s > 24) lit++
      if (s > maxSum) maxSum = s
    }
    return {
      version: gl.getParameter(gl.VERSION),
      renderer: gl.getParameter(gl.RENDERER),
      width: w,
      height: h,
      litPixels: lit,
      totalPixels: w * h,
      litFraction: lit / (w * h),
      maxBrightness: maxSum,
    }
  })

  const shotPath = path.resolve(__dirname, '..', 'validation-screenshot.png')
  await page.screenshot({ path: shotPath })

  console.log('\n=== HUD ===')
  console.log(hudText || '(vazio)')
  console.log('\n=== WebGL/pixels ===')
  console.log(JSON.stringify(glInfo, null, 2))
  console.log('\n=== console/errors ===')
  console.log(logs.length ? logs.join('\n') : '(sem mensagens)')
  console.log('\nscreenshot:', shotPath)

  try {
    await Promise.race([browser.close(), new Promise((r) => setTimeout(r, 4000))])
  } catch {
    /* ignore */
  }
  server.closeAllConnections?.()
  server.close()
  process.exit(0)
}

main().catch((e) => {
  console.error('VALIDATION FAILED:', e)
  process.exit(1)
})
