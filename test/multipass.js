'use strict'

const t = require('tape')
// const createWaveform = require('../index')
const createWaveform = require('is-travis') ? require('../') : require('../index')
const gl = require('gl')(400, 300)
const eq = require('image-equal')
const isBrowser = require('is-browser')
const img = require('image-pixels')
const oscillate = require('audio-oscillator')
const show = require('image-output')
const seed = require('seed-random')
const almost = require('almost-equal')
const { interactive } = require('./util')


t('multipass: single txt line mode', async t => {
	let data = oscillate.sin(16, {f: 5000}).map(x => x + 1)
	let wf = createWaveform(gl)
	wf.update({shape: [4, 4], thickness: 10, amplitude: [-2, 4]})
	wf.push(data)

	wf.render()
	t.ok(eq(await img`./test/fixture/multipass-16.png`, wf), 'fit')
	wf.clear()

	wf.range = [-6, 10]
	wf.render()
	t.ok(eq(await img`./test/fixture/multipass-16r.png`, wf), 'right')
	wf.clear()

	wf.range = [-10, 6]
	wf.render()
	t.ok(eq(await img`./test/fixture/multipass-16r2.png`, wf), 'right 2')
	wf.clear()

	wf.range = [10, 26]
	wf.render()
	t.ok(eq(await img`./test/fixture/multipass-16l.png`, wf), 'left')
	wf.clear()

	wf.range = [15, 31]
	wf.render()
	t.ok(eq(await img`./test/fixture/multipass-16l-edge.png`, wf), 'left edge')
	wf.clear()

	wf.range = [16, 32]
	wf.render()
	t.ok(eq(await img`./test/fixture/none.png`, wf), 'left edge 2')
	wf.clear()

	wf.range = [-8, 24]
	wf.render()
	t.ok(eq(await img`./test/fixture/multipass-16c.png`, wf), 'zoom out')
	wf.clear()

	wf.range = [-17, 15]
	wf.render()
	t.ok(eq(await img`./test/fixture/multipass-16cr.png`, wf), 'zoom out')
	wf.clear()

	// document.body.appendChild(wf.canvas)
	// interactive(wf, c => {console.log(wf.range)})

	t.end()
})

t('multipass: single txt range mode', async t => {
	let data = oscillate.sin(16, {f: 5000}).map(x => x + 1)
	let wf = createWaveform(gl)
	wf.mode = 'range'
	wf.update({shape: [4, 4], thickness: 10, amplitude: [-2, 4]})
	wf.push(data)

	wf.render()
	t.ok(eq(await img`./test/fixture/multipass-16.png`, wf), 'default')
	wf.clear()

	wf.range = [-6, 10]
	wf.render()
	t.ok(eq(await img`./test/fixture/multipass-16r.png`, wf), 'right')
	wf.clear()

	wf.range = [-10, 6]
	wf.render()
	t.ok(eq(await img`./test/fixture/multipass-16r2.png`, wf), 'right2')
	wf.clear()

	wf.range = [6, 22]
	wf.render()
	t.ok(eq(await img`./test/fixture/multipass-16l2.png`, wf, .3), 'left2')
	wf.clear()

	wf.range = [10, 26]
	wf.render()
	t.ok(eq(await img`./test/fixture/multipass-16l.png`, wf), 'left')
	wf.clear()

	wf.range = [0.9999999, 16.9999999]
	wf.render()
	t.ok(eq(await img`./test/fixture/multipass-16s.png`, wf), 'snap')
	wf.clear()

	wf.range = [-8, 24]
	wf.render()
	t.ok(eq(await img`./test/fixture/multipass-16c.png`, wf), 'zoom out')
	wf.clear()

	// document.body.appendChild(wf.canvas)
	// interactive(wf, c => {
	// 	console.log(wf.range)
	// })

	t.end()
})

t('multipass: aliquot txt lengths (16, 32, 64, ...)', async t => {
	let data = oscillate.sin(32, {f: 5000})
	let wf = createWaveform(gl)
	wf.update({shape: [4, 4], thickness: 10, amplitude: [-3, 3]})
	wf.push(data)

	wf.render()
	t.ok(eq(await img`./test/fixture/multipass-32.png`, wf), 'default')
	wf.clear()

	wf.range = [-16, 16]
	wf.render()
	t.ok(eq(await img`./test/fixture/multipass-32r2.png`, wf), 'half-right')
	wf.clear()

	wf.range = [-28, 4]
	wf.render()
	t.ok(eq(await img`./test/fixture/multipass-32r.png`, wf), 'some-right')
	wf.clear()

	wf.range = [28, 60]
	wf.render()
	t.ok(eq(await img`./test/fixture/multipass-32l.png`, wf), 'some-left')
	wf.clear()

	wf.range = [-10, 42]
	wf.render()
	t.ok(eq(await img`./test/fixture/multipass-32c.png`, wf), 'some-left')
	wf.clear()

	// document.body.appendChild(wf.canvas)
	// interactive(wf, c => {
	// 	console.log(wf.range)
	// })

	t.end()
})

t('multipass: aliquant txt lengths, line mode (20, 40, ...)', async t => {
	let data = oscillate.sin(20, {f: 5000})
	let wf = createWaveform(gl)

	wf.update({shape: [4, 4], thickness: 10, amplitude: [-3, 3]})
	wf.push(data)
	wf.mode = 'line'

	wf.render()
	t.ok(eq(await img`./test/fixture/multipass-20.png`, wf), 'default')
	wf.clear()

	wf.range = [-12, 8]
	wf.render()
	t.ok(eq(await img`./test/fixture/multipass-20r.png`, wf), 'right')
	wf.clear()

	wf.range = [16, 36]
	wf.render()
	t.ok(eq(await img`./test/fixture/multipass-20l.png`, wf), 'left')
	wf.clear()

	// document.body.appendChild(wf.canvas)
	// interactive(wf, c => {
	// 	console.log(wf.range)
	// })

	t.end()
})

t('multipass: aliquant txt lengths, range mode (20, 40, ...)', async t => {
	let data = oscillate.sin(20, {f: 5000})
	let wf = createWaveform(gl)

	wf.update({shape: [4, 4], thickness: 10, amplitude: [-3, 3]})
	wf.push(data)
	wf.mode = 'range'

	wf.render()
	t.ok(eq(await img`./test/fixture/multipass-20.png`, wf), 'default')
	wf.clear()

	wf.range = [-12, 8]
	wf.render()
	t.ok(eq(await img`./test/fixture/multipass-20r.png`, wf), 'right')
	wf.clear()

	wf.range = [16, 36]
	wf.render()
	t.ok(eq(await img`./test/fixture/multipass-20l.png`, wf), 'left')
	wf.clear()

	// document.body.appendChild(wf.canvas)
	// interactive(wf, c => {
		// console.log(wf.range)
	// })

	t.end()
})

t.skip('multipass: n textures', async t => {
	let data = oscillate.sin(32, {f: 5000})

	let wf = createWaveform(gl)
	wf.mode = 'range'

	wf.update({shape: [4, 4], thickness: 10, amplitude: [-3, 3]})
	wf.push(data)

	wf.render()
	t.ok(eq(await img`./test/fixture/multipass-16.png`, wf))
	wf.clear()

	wf.range = [-6, 10]
	wf.render()
	t.ok(eq(await img`./test/fixture/multipass-16r.png`, wf))
	wf.clear()

	wf.range = [-10, 6]
	wf.render()
	t.ok(eq(await img`./test/fixture/multipass-16r2.png`, wf))
	wf.clear()

	wf.range = [6, 22]
	wf.render()
	t.ok(eq(await img`./test/fixture/multipass-16l2.png`, wf, .3))
	wf.clear()

	wf.range = [10, 26]
	wf.render()
	t.ok(eq(await img`./test/fixture/multipass-16l.png`, wf))
	wf.clear()

	wf.range = [-8, 24]
	wf.render()
	t.ok(eq(await img`./test/fixture/multipass-16c.png`, wf))
	wf.clear()

	document.body.appendChild(wf.canvas)
	interactive(wf, c => {})

	t.end()
})

t.skip('multipass: problematic sampleStep aliquant to texture length')
