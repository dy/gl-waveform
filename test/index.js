'use strict'

const t = require('tape')
// const createWaveform = require('../index')
const createWaveform = require('../')
const panzoom = require('pan-zoom')
const gl = require('gl')(400, 300)
const eq = require('image-equal')
const isBrowser = require('is-browser')
const img = require('image-pixels')
const oscillate = require('audio-oscillator')
const show = require('image-output')


t('empty data chunks are not being displayed', async t => {
	var wf = createWaveform(gl)
	wf.push([0,0,,0,0, 1,2,,4,5, 5,2.5,,-2.5,-5])
	wf.update({
		width: 10,
		amplitude: [-5, 5],
		range: [0,15]
	})

	wf.render()

	interactive(wf)

	// document.body.appendChild(gl.canvas)
	t.ok(eq(wf, await img('./test/fixture/empty.png')))

	wf.clear()

	t.end()
})

t('xy noises case', async t => {
	var wf = createWaveform(gl)
	wf.push([
		{x: 1013, y: 137},
		{x: 1014, y: 137},
		{x: 1015, y: 138},
		{x: 1016, y: 151},
		{x: 1017, y: 151},
		{x: 1018, y: 151},
		{x: 1019, y: 151},
		{x: 1020, y: 151},
		{x: 1021, y: 182},
		{x: 1022, y: 182},
		{x: 1023, y: 182},
		{x: 1024, y: 182},
		{x: 1025, y: 182},
		{x: 1026, y: 182},
		{x: 1027, y: 182},
		{x: 1028, y: 182}])

	wf.update({
		width: 10,
		amplitude: [0, 200],
		range: [1013, 1029]
	})

	wf.render()

	t.ok(eq(wf, await img('./test/fixture/xy-1.png')))

	wf.clear()

	t.end()
})

t('first point displays correctly', async t => {
	var wf = createWaveform(gl)
	wf.push(oscillate.sin(1024).map(x => x + 10))

	wf.update({
		width: 2,
		amplitude: [1, 12],
		range: [0, 400]
	})

	wf.render()

	t.ok(eq(wf, await img('./test/fixture/first-point.png')))

	wf.clear()

	t.end()
})

t.only('>1 values does not create float32 noise', async t => {
	var data = oscillate.sin(2048).map(x => x + 10)

	var wf = createWaveform(gl)
	wf.push(data)

	wf.update({
		width: 1,
		amplitude: [1, 12],
		range: [0, 400]
	})

	wf.render()

	show(wf.canvas, document)
	// t.ok(eq(wf, await img('./test/fixture/xy-1.png')))

	wf.clear()

	t.end()
})

t.skip('empty data chunks in range mode do not add variance', async t => {
	// TODO: add range-render empty data test
	t.end()
})

t('clear method')

t('timestamp gaps get interpolated by edge values', async t => {
	var wf = createWaveform({gl})

	wf.push([
		{x: 0, y: 0},
		{x: 11, y: 11},
		{x: 20, y: 20},
		{x: 21, y: 30},
		{x: 22, y: null},
		{x: 30, y: null},
		{x: 31, y: 30},
		{x: 32, y: 40}
	])
	wf.update({
		width: 10,
		amplitude: 40,
		range: [0, 40]
	})

	wf.render()

	t.ok(eq(wf, await img('./test/fixture/interpolate.png'), {threshold: .3}))
	// document.body.appendChild(gl.canvas)
	wf.clear()

	t.end()
})

t('axis and grids', async t => {
	t.end()
})

t('null-canvas instances does not create multiple canvases')

t('calibrate step to pixels')

t('calibrate data range')

t('calibrate thickness to pixels')

t('line ends cover viewport without change')

t('texture join: no seam')

t('texture resets sum2 error')

t('negative data range is displayed from the tail')

t('line/range mode is switched properly')

t('2σ thickness scheme')

t.skip('multipass rendering for large zoom levels', t => {
	let wf = createWaveform()

	interactive(wf)

	wf.update({
		data: generate.sine(1e5, {frequency: 50})
	})

	wf.destroy()

	t.end()
})

t('tail rendering')

t('head rendering')

t('correct everything for line mode')

t('large data has no artifacts or noise')

t('viewport: correct translate, thickness, angle')

t('panning does not change image')

t('empty data does not break rendering')

t('waveform creation is quick enough (faster than 200ms)')


function interactive(wf, o) {
	if (!isBrowser) return

	panzoom(wf.canvas, e => {
		let range = wf.range.slice()

		let w = wf.canvas.offsetWidth
		let h = wf.canvas.offsetHeight

		let rx = e.x / w
		let ry = e.y / h

		let xrange = range[1] - range[0]

		if (e.dz) {
			let dz = e.dz / w
			range[0] -= rx * xrange * dz
			range[1] += (1 - rx) * xrange * dz
		}

		range[0] -= xrange * e.dx / w
		range[1] -= xrange * e.dx / w

		wf.update({ range })
		wf.render()
	})
}
