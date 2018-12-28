'use strict'

const t = require('tape')
const createWaveform = require('../index')
// const createWaveform = require('../')
const gl = require('gl')(400, 300)
const eq = require('image-equal')
const isBrowser = require('is-browser')
const img = require('image-pixels')
const oscillate = require('audio-oscillator')
const show = require('image-output')
const seed = require('seed-random')
const almost = require('almost-equal')
const { interactive } = require('./util')


t('calibrate automatic values/range', async t => {
	let wf = createWaveform(gl)

	wf.push([1,2,0,2])
	wf.update({width: 4, color: 'green'})
	wf.render()

	t.equal(wf.total, 4)
	t.equal(wf.minY, 0, 'minY')
	t.equal(wf.maxY, 2, 'maxY')
	// show(wf, document)
	t.ok(eq(await img`./test/fixture/calibrate1.png`, wf), 'img ok')
	wf.clear()

	wf.update({data: [2,3,1,3], width: 4, color: 'green'})
	wf.render()
	t.ok(eq(await img`./test/fixture/calibrate1.png`, wf))
	t.equal(wf.total, 4)
	t.equal(wf.minY, 1)
	t.equal(wf.maxY, 3)

	wf.clear()

	// document.body.appendChild(wf.canvas)
	// interactive(wf)

	t.end()
})

// FIXME: when we add position shift the second test should be corrected
t.skip('calibrate step/end: thickness should not bend', async t => {
	var wf = createWaveform(gl)

	wf.push([0, 1, 1, -1, 1, 0])
	wf.thickness = 10
	wf.amplitude = [-2, 2]
	wf.viewport = [100,100,200,200]

	// calibrate end
	wf.range = [-.5, 6.5]
	wf.mode = 'range'
	wf.render()
	t.ok(eq(await img`./test/fixture/calibrate-end.png`, wf, .3))
	wf.clear()

	wf.range = [1, 7]
	wf.mode = 'range'
	wf.render()
	t.ok(eq(await img`./test/fixture/calibrate-end-range.png`, wf, .3))
	wf.clear()

	document.body.appendChild(wf.canvas)
	interactive(wf, r => {
	})

	t.end()
})

t('empty data chunks are not being displayed', async t => {
	var wf = createWaveform(gl)
	wf.push([0,0,,0,0, 1,2,,4,5, 5,2.5,,-2.5,-5])
	wf.update({
		width: 10,
		amplitude: [-5, 5],
		range: [0,15]
	})

	wf.render()

	// interactive(wf)
	// document.body.appendChild(wf.canvas)

	t.ok(eq(wf, await img('./test/fixture/empty.png'), .3))

	wf.clear()

	t.end()
})
