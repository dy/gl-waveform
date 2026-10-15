import test from 'node:test'
import assert from 'node:assert/strict'
import { open, origin } from './browser.js'
import { generator, parse } from '../example/data.js'

// A tone, a 16-bit mono WAV
export function wav(f = 1000, seconds = 3, rate = 48000) {
  const n = rate * seconds, bytes = Buffer.alloc(44 + n * 2)
  bytes.write('RIFF'); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write('WAVEfmt ', 8)
  bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22); bytes.writeUInt32LE(rate, 24)
  bytes.writeUInt32LE(rate * 2, 28); bytes.writeUInt16LE(2, 32); bytes.writeUInt16LE(16, 34); bytes.write('data', 36); bytes.writeUInt32LE(n * 2, 40)
  for (let i = 0; i < n; i++) bytes.writeInt16LE(Math.round(Math.sin(2 * Math.PI * f * i / rate) * 16000), 44 + i * 2)
  return bytes
}
// Pixels drawn in a canvas, in [x0, x1) of its width
const ink = (page, id, x0 = 0, x1 = 1) => page.evaluate(([id, x0, x1]) => {
  const c = document.getElementById(id), t = Object.assign(document.createElement('canvas'), { width: c.width, height: c.height }), g = t.getContext('2d')
  g.drawImage(c, 0, 0)
  const a = Math.floor(x0 * c.width), b = Math.ceil(x1 * c.width), d = g.getImageData(a, 0, b - a, c.height).data
  let s = 0
  for (let i = 3; i < d.length; i += 4) s += d[i] > 0
  return s
}, [id, x0, x1])

test('numeric input: channels, gaps, arbitrary values; malformed files fail', () => {
  assert.deepEqual(parse('2,4\n3,5').map(d => [...d]), [[2, 3], [4, 5]])
  assert.deepEqual(parse('1,,3\n4,5,6').map(d => [...d]), [[1, 4], [NaN, 5], [3, 6]])
  assert.deepEqual([...parse('[1000,null,-2000]', true)[0]], [1000, NaN, -2000])
  for (const text of ['', '1,2\n3', 'value\n2', '1e99']) assert.throws(() => parse(text))
  for (const text of ['{}', '[]', '[[1],[2,3]]', '[true]', '["garbage"]']) assert.throws(() => parse(text, true))
})

test('the hour keeps its silence, clipping and single-sample spike, the same in any blocks', () => {
  const [left, right] = generator('voice', { count: 1000000 }).next(1000000)
  const spike = Math.round((308000 + 312200) / 2)
  assert.equal(left[spike], Math.fround(.9)); assert.equal(right[spike], 0)
  assert.ok(left.subarray(83000, 86300).every(v => v === 0))
  assert.ok(left.subarray(667000, 692000).some(v => Math.abs(v) === 1))
  const whole = generator('voice').next(9000), chunks = generator('voice'), a = chunks.next(3333), b = chunks.next(5667)
  whole.forEach((d, i) => assert.deepEqual([...d], [...a[i], ...b[i]]))
  // the left alone, written over one block, as the demo streams it
  const one = generator('voice', { channels: 1 }), buf = new Float32Array(5667)
  assert.deepEqual([...one.next(3333, [buf.subarray(0, 3333)])[0], ...one.next(5667, [buf])[0]], [...whole[0]])
})

test('demo: a recording drawn before ▶ and played over it; the hour streams in; drag, zoom, palettes, numbers', async () => {
  const { browser, page } = await open({ width: 1000, height: 700 }), errors = []
  page.on('pageerror', e => errors.push(e.message))
  // offline: the libraries' stand-ins, and a tone for every recording
  await page.route(url => !url.href.startsWith(origin), route => /upload\.wikimedia\.org/.test(route.request().url())
    ? route.fulfill({ body: wav(110, 6), contentType: 'audio/wav', headers: { 'access-control-allow-origin': '*' } }) : route.abort())
  try {
    await page.goto(origin + '/index.html')
    const text = id => page.locator('#' + id).textContent(), shot = id => page.locator('#' + id).evaluate(c => c.toDataURL())
    const progress = () => page.evaluate(() => parseFloat(document.getElementById('progress').style.width) || 0)
    await page.waitForFunction(() => /^288\D000 samples/.test(document.getElementById('stats').textContent))
    assert.ok((await text('title')).startsWith('Bach'))
    assert.ok(await ink(page, 'chart', 0, .1) > 50 && await ink(page, 'chart', .9, 1) > 50, 'the first screen, before a click: 6 s of tone across the view')
    for (const id of ['swatch', 'envelope', 'width', 'grid-on']) assert.ok(await page.locator('#' + id).count(), id)

    await page.locator('#play').click()
    await page.waitForFunction(() => document.getElementById('play').getAttribute('aria-label') === 'Pause')
    await page.waitForFunction(() => parseFloat(document.getElementById('progress').style.width) > 0) // the context's clock started
    let wave = await shot('chart'), grid = await shot('grid'), p = await progress()
    await page.waitForTimeout(400)
    assert.ok(await progress() > p, `the playhead moves on from ${p} %`)
    assert.notEqual(await shot('grid'), grid, 'the playhead drawn where it is')
    assert.equal(await shot('chart'), wave, 'the waveform holds still as it plays, its amplitude too')
    await page.locator('#play').click(); p = await progress(); await page.waitForTimeout(300)
    assert.equal(await page.locator('#play').getAttribute('aria-label'), 'Play')
    assert.equal(await progress(), p, 'paused')

    await page.locator('#file').setInputFiles({ name: 'tone.wav', mimeType: 'audio/wav', buffer: wav(220, 4) })
    await page.waitForFunction(() => /^192\D000 samples/.test(document.getElementById('stats').textContent))
    assert.equal(await page.locator('#play').getAttribute('aria-label'), 'Pause', 'an opened file plays once decoded')
    assert.ok(await ink(page, 'chart', 0, .1) > 50 && await ink(page, 'chart', .9, 1) > 50, 'drawn whole')

    const box = await page.locator('#chart').boundingBox()
    let s = await shot('chart'); await page.mouse.move(box.x + 500, box.y + 300); for (let i = 0; i < 3; i++) await page.mouse.wheel(0, -400) // in from 4 s to under a second
    await page.waitForTimeout(100); assert.notEqual(await shot('chart'), s, 'zoomed in time')
    s = await shot('chart')
    await page.mouse.move(box.x + 300, box.y + 350); await page.mouse.down(); await page.mouse.move(box.x + 600, box.y + 350, { steps: 5 }); await page.mouse.up()
    await page.waitForTimeout(100); assert.notEqual(await shot('chart'), s, 'dragged back in time')
    s = await shot('chart'); await page.keyboard.down('Shift'); await page.mouse.wheel(0, -300); await page.keyboard.up('Shift'); await page.waitForTimeout(100)
    assert.notEqual(await shot('chart'), s, 'zoomed in amplitude')
    s = await shot('chart'); await page.locator('#envelope').selectOption('gaussian'); await page.waitForTimeout(100); assert.notEqual(await shot('chart'), s, 'envelope')
    s = await shot('chart'); await page.locator('#envelope').selectOption('laplace'); await page.waitForTimeout(100); assert.notEqual(await shot('chart'), s, 'laplace')
    s = await shot('chart'); await page.locator('#swatch').click(); await page.waitForTimeout(100); assert.notEqual(await shot('chart'), s, 'a new palette')

    await page.locator('#source summary').click(); await page.locator('[data-id=hour]').click()
    await page.waitForTimeout(1500)
    assert.ok(await ink(page, 'chart', .9, 1) > 100, 'the hour comes in from the right')
    assert.match(await text('stats'), /samples\n\+[\d\s]+ \/s$/, 'samples held, and pushed a second')
    await page.locator('#file').setInputFiles({ name: 'values.json', mimeType: 'application/json', buffer: Buffer.from('[1000,2000,null,-3000]') })
    await page.waitForFunction(() => document.getElementById('title').textContent === 'values.json'); await page.waitForTimeout(200)
    assert.ok(await ink(page, 'chart') > 50, 'numbers drawn whole')
    for (const width of [375, 768]) { await page.setViewportSize({ width, height: 700 }); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true) }
    assert.deepEqual(errors, [])
  } finally { await browser.close() }
})
