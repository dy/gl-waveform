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
})

test('demo: sound comes in from the right as it plays; the hour streams in; drag, zoom, palettes, numbers', async () => {
  const { browser, page } = await open({ width: 1000, height: 700 }), errors = []
  page.on('pageerror', e => errors.push(e.message))
  await page.route(url => !url.href.startsWith(origin), route => route.abort()) // offline: the libraries' stand-ins
  try {
    await page.goto(origin + '/index.html')
    await page.waitForFunction(() => document.getElementById('title').textContent.startsWith('Bach'))
    assert.equal(await ink(page, 'chart'), 0, 'nothing before a click')
    for (const id of ['swatch', 'envelope', 'width', 'grid-on']) assert.ok(await page.locator('#' + id).count(), id)

    await page.locator('#file').setInputFiles({ name: 'tone.wav', mimeType: 'audio/wav', buffer: wav(220, 4) })
    await page.waitForFunction(() => document.getElementById('play').getAttribute('aria-label') === 'Pause')
    await page.waitForTimeout(1200)
    assert.ok(await ink(page, 'chart', .8, 1) > 50, 'the newest on the right')
    assert.equal(await ink(page, 'chart', 0, .2), 0, 'nothing yet on the left')
    await page.locator('#play').click()

    const box = await page.locator('#chart').boundingBox(), shot = () => page.locator('#chart').evaluate(c => c.toDataURL())
    let s = await shot(); await page.mouse.move(box.x + 500, box.y + 300); for (let i = 0; i < 3; i++) await page.mouse.wheel(0, -400) // in from 20 s to under the second of sound there is
    await page.waitForTimeout(100); assert.notEqual(await shot(), s, 'zoomed in time')
    s = await shot()
    await page.mouse.move(box.x + 300, box.y + 350); await page.mouse.down(); await page.mouse.move(box.x + 600, box.y + 350, { steps: 5 }); await page.mouse.up()
    await page.waitForTimeout(100); assert.notEqual(await shot(), s, 'dragged back in time')
    s = await shot(); await page.keyboard.down('Shift'); await page.mouse.wheel(0, -300); await page.keyboard.up('Shift'); await page.waitForTimeout(100)
    assert.notEqual(await shot(), s, 'zoomed in amplitude')
    s = await shot(); await page.locator('#envelope').selectOption('density'); await page.waitForTimeout(100); assert.notEqual(await shot(), s, 'envelope')
    s = await shot(); await page.locator('#swatch').click(); await page.waitForTimeout(100); assert.notEqual(await shot(), s, 'a new palette')

    await page.locator('#source summary').click(); await page.locator('[data-id=hour]').click()
    await page.waitForTimeout(1500)
    assert.ok(await ink(page, 'chart', .9, 1) > 100, 'the hour comes in from the right')
    await page.locator('#file').setInputFiles({ name: 'values.json', mimeType: 'application/json', buffer: Buffer.from('[1000,2000,null,-3000]') })
    await page.waitForFunction(() => document.getElementById('title').textContent === 'values.json'); await page.waitForTimeout(200)
    assert.ok(await ink(page, 'chart') > 50, 'numbers drawn whole')
    for (const width of [375, 768]) { await page.setViewportSize({ width, height: 700 }); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true) }
    assert.deepEqual(errors, [])
  } finally { await browser.close() }
})
