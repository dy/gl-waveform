import test from 'node:test'
import assert from 'node:assert/strict'
import { open, origin } from './browser.js'
import { generator, parse } from '../example/data.js'

test('numeric input: channels, gaps, arbitrary values; malformed files fail', () => {
  assert.deepEqual(parse('2,4\n3,5').map(d => [...d]), [[2, 3], [4, 5]])
  assert.deepEqual(parse('1,,3\n4,5,6').map(d => [...d]), [[1, 4], [NaN, 5], [3, 6]])
  assert.deepEqual([...parse('[1000,null,-2000]', true)[0]], [1000, NaN, -2000])
  assert.deepEqual([...parse('1,2,3')[0]], [1, 2, 3])
  for (const text of ['', '1,2\n3', 'value\n2', '1e99']) assert.throws(() => parse(text))
  for (const text of ['{}', '[]', '[[1],[2,3]]', '[true]', '["garbage"]']) assert.throws(() => parse(text, true))
})

test('signals: streaming chunks continue the same signal, independent of block size', () => {
  for (const source of ['osc', 'noise', 'walk', 'steps', 'gaps', 'voice']) {
    const whole = generator(source).next(9000), chunks = generator(source)
    const a = chunks.next(3333), b = chunks.next(5667)
    whole.forEach((d, i) => assert.deepEqual([...d], [...a[i], ...b[i]], source))
  }
})

test('playground: generic values, settings, navigation, stream, file errors and reset', async () => {
  const { browser, page } = await open({ width: 1100, height: 850 }), errors = []
  page.on('pageerror', e => errors.push(e.message))
  const text = id => page.locator('#' + id).textContent()
  const wait = str => page.waitForFunction(s => { const status = document.getElementById('status').textContent; return !status.startsWith('Opening ') && status.includes(s) }, str)
  const pixels = () => page.locator('#chart').evaluate(c => c.toDataURL())
  const change = async (id, val) => { await page.locator('#' + id).fill(val); await page.locator('#' + id).press('Tab') }
  try {
    await page.goto(origin + '/index.html'); await page.waitForURL(origin + '/example/');
    assert.equal(new URL(page.url()).pathname, '/example/'); await wait('8,192 samples')
    await page.waitForFunction(() => document.getElementById('perf').textContent.includes('ms/frame'))
    const initial = await pixels()
    await change('offset', '1000'); await page.waitForFunction(() => +document.getElementById('low').value > 900)
    const box = await page.locator('#chart').boundingBox()
    await page.mouse.move(box.x + box.width / 2, box.y + 80)
    assert.match(await text('readout'), /Sine.*(value|min)/)
    await page.locator('#samples').click(); await page.waitForFunction(() => document.getElementById('view').textContent !== '0 → 8,192 samples'); const detailed = await text('view'); assert.notEqual(detailed, '0 → 8,192 samples')
    await page.locator('#chart').focus(); await page.keyboard.press('Home')
    await page.waitForFunction(() => document.getElementById('view').textContent === '0 → 8,192 samples')
    await page.locator('#chart').focus(); await page.keyboard.press('+'); await page.keyboard.press('ArrowRight')
    await page.waitForFunction(() => document.getElementById('view').textContent !== '0 → 8,192 samples')
    await change('low', '1000'); await change('high', '1000'); assert.match(await text('error'), /must differ/)
    await change('high', '1002'); assert.equal(await page.locator('#error').isHidden(), true)
    await page.locator('#fill').selectOption('density'); await page.locator('#grid-on').uncheck()
    assert.notEqual(await pixels(), initial)
    await page.locator('#follow').check(); await page.locator('#stream').click()
    await page.waitForFunction(() => !document.getElementById('status').textContent.includes('8,192 samples'))
    await page.locator('#stream').click(); const stopped = await text('status'); await page.waitForTimeout(200); assert.equal(await text('status'), stopped)
    await page.locator('#file').setInputFiles({ name: 'values.json', mimeType: 'application/json', buffer: Buffer.from('[1000,2000,null,-3000]') })
    await wait('values.json'); assert.equal(await page.locator('#stream').isDisabled(), true)
    assert.ok(+(await page.locator('#low').inputValue()) < -3000)
    await page.locator('#file').setInputFiles({ name: 'bad.csv', mimeType: 'text/csv', buffer: Buffer.from('value,nope') })
    await page.waitForFunction(() => !document.getElementById('error').hidden)
    assert.match(await text('status'), /values.json/)
    await page.locator('[type=reset]').click(); await wait('Oscillators')
    assert.equal(await page.locator('#stream').isEnabled(), true); assert.equal(await page.locator('#error').isHidden(), true)
    for (const width of [320, 375, 414, 768]) {
      await page.setViewportSize({ width, height: 850 })
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
      await page.locator('#settings').click(); await page.locator('#settings').click()
    }
    // A fresh narrow viewport starts with the settings collapsed and remains keyboard accessible.
    await page.setViewportSize({ width: 375, height: 850 }); await page.reload(); await wait('Oscillators')
    assert.equal(await page.locator('#panel').isHidden(), true)
    await page.locator('#settings').focus(); await page.keyboard.press('Enter'); assert.equal(await page.locator('#panel').isVisible(), true)
    assert.deepEqual(errors, [])
  } finally { await browser.close() }
})
