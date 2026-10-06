// The v4 demos recreated on v5: example/old.html (data) and example/old-multi.html (multiscale)
import test from 'node:test'
import assert from 'node:assert/strict'
import { open, origin } from './browser.js'

// Inked pixels of the canvas in `bins` horizontal bands
const ink = (page, bins = 1) => page.evaluate(bins => {
  let src = document.querySelector('canvas'), { width: w, height: h } = src, c = new OffscreenCanvas(w, h), ctx = c.getContext('2d'), n = Array(bins).fill(0)
  ctx.drawImage(src, 0, 0)
  let d = ctx.getImageData(0, 0, w, h).data
  for (let i = 3; i < d.length; i += 4) if (d[i]) n[Math.floor((i >> 2) / w / h * bins)]++
  return n
}, bins)

const load = async path => {
  let { browser, page } = await open(), errors = []
  page.on('pageerror', e => errors.push(e.message))
  await page.goto(origin + path)
  return { browser, page, errors }
}

test('v4 data demo: three lanes stream, pause stops them, controls redraw', async () => {
  let { browser, page, errors } = await load('/example/old.html')
  try {
    let total = () => page.locator('#total').textContent()
    await page.waitForFunction(() => document.getElementById('total').textContent)
    await page.waitForTimeout(300)
    for (let n of await ink(page, 3)) assert.ok(n > 500, `every lane has ink: ${n}`)

    let a = await total()
    await page.waitForFunction(a => document.getElementById('total').textContent !== a, a)

    await page.locator('#pause').click()
    await page.waitForTimeout(100)
    let b = await total()
    await page.waitForTimeout(500)
    assert.equal(await total(), b, 'paused')

    let thin = (await ink(page))[0]
    await page.locator('[data-for=thickness]').fill('6')
    await page.locator('[data-for=thickness]').press('Enter')
    await page.waitForTimeout(100)
    assert.ok((await ink(page))[0] > thin * 2, 'thickness widens the lines')

    await page.locator('#pause').click()
    await page.waitForFunction(b => document.getElementById('total').textContent !== b, b)
    assert.deepEqual(errors, [])
  } finally { await browser.close() }
})

test('v4 multiscale demo: lanes of one stream, inked and moving', async () => {
  let { browser, page, errors } = await load('/example/old-multi.html')
  try {
    await page.waitForFunction(() => document.querySelector('canvas').width > 0)
    await page.waitForTimeout(500)
    let bands = await ink(page, 8)
    for (let n of bands) assert.ok(n > 200, `ink in every band: ${bands}`)
    let a = await page.locator('canvas').evaluate(c => c.toDataURL())
    await page.waitForTimeout(200)
    assert.notEqual(await page.locator('canvas').evaluate(c => c.toDataURL()), a, 'the stream advances')
    assert.deepEqual(errors, [])
  } finally { await browser.close() }
})
