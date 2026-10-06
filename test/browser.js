// Headless Chromium with the repo served on a routed origin: no server, no port
import { chromium } from 'playwright'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
// https: the demos capture sound through an AudioWorklet, which only a secure context has
export const origin = 'https://gl-waveform.test'

/** Open a page at origin; gpu: true asks for the hardware GPU (default is SwiftShader, deterministic) */
export async function open({ gpu = false, width = 1024, height = 768 } = {}) {
  let args = gpu ? (process.platform === 'darwin' ? ['--use-angle=metal'] : ['--enable-gpu', '--ignore-gpu-blocklist']) : []
  let browser = await chromium.launch({ args })
  let page = await browser.newPage({ viewport: { width, height } })
  page.on('pageerror', e => console.error('page error:', e))
  await page.route(origin + '/**', route => {
    let p = decodeURIComponent(new URL(route.request().url()).pathname)
    if (p === '/') return route.fulfill({ contentType: 'text/html', body: '<!doctype html><body style="margin:0"></body>' })
    return route.fulfill({ path: root + p.slice(1) + (p.endsWith('/') ? 'index.html' : '') })
  })
  await page.goto(origin + '/')
  return { browser, page }
}
