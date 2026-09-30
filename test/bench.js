// npm run bench: timings for 1M, 10M and 172.8M samples (1 hour at 48 kHz) of synthetic speech, hardware GPU,
// stereo lanes at DPR 2
import { open } from './browser.js'

let { browser, page } = await open({ gpu: true })

let res = await page.evaluate(async () => {
  let { default: Waveform } = await import('/index.js'), { default: voice } = await import('/example/voice.js')
  let W = 1440, H = 200, pr = 2, c = document.createElement('canvas')
  c.width = W * pr; c.height = 2 * H * pr
  document.body.append(c)
  let lanes = [0, 1].map(i => new Waveform(c, { pixelRatio: pr, viewport: [0, i * H, W, H] }))
  let gl = lanes[0].gl, ext = gl.getExtension('WEBGL_debug_renderer_info')
  let gpu = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)
  let now = () => performance.now(), out = []
  let stats = t => { t.sort((a, b) => a - b); return { mean: t.reduce((a, b) => a + b) / t.length, median: t[t.length >> 1], p95: t[Math.floor(t.length * .95)], max: t.at(-1) } }

  let signal = n => { let d = new Float32Array(n); voice(1)(d, 0, n); return d }
  await new Promise(done => { let t0 = now(); requestAnimationFrame(function f() { now() - t0 < 1000 ? requestAnimationFrame(f) : done() }) }) // compositor warm-up

  // a frame: update the range of both lanes, clear, draw; gl.finish so GPU work is inside the timing
  let frame = range => {
    let t = now()
    for (let wf of lanes) wf.update({ range }).clear().render()
    gl.finish()
    return now() - t
  }

  for (let n of [1e6, 1e7, 172.8e6]) {
    // update({ data }): median of 5, as memory bandwidth on a busy machine varies run to run
    let d = signal(n), row = { n }
    row.update = stats(Array.from({ length: 5 }, () => { let s = now(); lanes[0].update({ data: d, range: null }); return now() - s })).median
    lanes[1].update({ data: d, range: null })

    row.first = frame(null)
    row.idle = stats(Array.from({ length: 60 }, () => { let s = now(); for (let wf of lanes) wf.render(); gl.finish(); return now() - s })).mean

    // zoom from the whole file to 0.01 samples per px and back, around a point at 40%
    let zoom = []
    for (let k = 0; k <= 240; k++) {
      let z = k <= 120 ? k / 120 : (240 - k) / 120, spp = (n / (W * pr)) * Math.pow(.01 / (n / (W * pr)), z)
      let span = spp * W * pr, at = n * .4
      zoom.push(frame([at - span * .4, at + span * .6]))
    }
    row.zoom = stats(zoom)

    // pan at 1000 samples per px, 7 CSS px per frame
    let pan = [], spp = 1000, from = n * .3
    for (let k = 0; k < 240; k++) pan.push(frame([from + k * 7 * pr * spp, from + k * 7 * pr * spp + spp * W * pr]))
    row.pan = stats(pan)

    // push: 1024-sample blocks onto the loaded data
    let block = d.subarray(0, 1024), s = now()
    for (let k = 0; k < 1000; k++) lanes[0].push(block)
    row.push = (now() - s) / 1000

    // 3 s of requestAnimationFrame zooming: the frame rate a user sees
    let frames = 0, t0 = now()
    await new Promise(done => {
      let tick = () => {
        let z = ((now() - t0) / 3000), spp = (n / (W * pr)) * Math.pow(.01 / (n / (W * pr)), z)
        frame([n * .5 - spp * W * pr / 2, n * .5 + spp * W * pr / 2])
        frames++
        if (now() - t0 < 3000) requestAnimationFrame(tick); else done()
      }
      requestAnimationFrame(tick)
    })
    row.fps = frames / ((now() - t0) / 1000)
    row.tree = Math.round(2 * Math.ceil(n / 256) * 32 / 1e6)
    out.push(row)
    for (let wf of lanes) wf.update({ data: [] })
  }
  return { gpu, ua: navigator.userAgent, out }
})

await browser.close()

let f = v => v < 10 ? v.toFixed(2) : v.toFixed(1)
console.log(`GPU: ${res.gpu}\n2 lanes of 1440×200 CSS px at DPR 2 (2880×400 device px each); frame = update({ range }) + clear() + render() on both lanes + gl.finish()\n`)
console.log('samples | update({ data }) | first frame | zoom frame mean / p95 / max | pan frame mean / p95 | unchanged frame | push 1024 | rAF fps | pyramid')
console.log('------- | ---------------- | ----------- | --------------------------- | -------------------- | --------------- | --------- | ------- | -------')
for (let r of res.out) console.log([
  (r.n / 1e6) + 'M', f(r.update) + ' ms', f(r.first) + ' ms', `${f(r.zoom.mean)} / ${f(r.zoom.p95)} / ${f(r.zoom.max)} ms`,
  `${f(r.pan.mean)} / ${f(r.pan.p95)} ms`, f(r.idle) + ' ms', (r.push * 1000).toFixed(1) + ' µs', r.fps.toFixed(0), r.tree + ' MB'
].join(' | '))
