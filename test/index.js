'use strict'

const t = require('tape')
const createWaveform = require('../index')
// const createWaveform = require('../')
const panzoom = require('pan-zoom')
const gl = require('gl')(400, 300)
const eq = require('image-equal')
const isBrowser = require('is-browser')
const img = require('image-pixels')
const oscillate = require('audio-oscillator')
const show = require('image-output')

t('calibrate automatic values/range', async t => {
	let wf = createWaveform(gl)

	wf.push([1,2,0,2])
	wf.update({width: 4, color: 'green'})
	wf.render()

	t.equal(wf.total, 4)
	t.equal(wf.minY, 0, 'minY')
	t.equal(wf.maxY, 2, 'maxY')
	t.equal(wf.firstX, 0, 'firstX')
	t.equal(wf.lastX, 3, 'lastX')

	show(wf, document)

	t.ok(eq(await img`./test/fixture/calibrate1.png`, wf))
	wf.clear()

	wf.update({data: [[1,2], [2,3], [3,1], [4,3]], width: 4, color: 'green'})
	wf.render()

	t.ok(eq(await img`./test/fixture/calibrate1.png`, wf))
	t.equal(wf.total, 4)
	t.equal(wf.minY, 1)
	t.equal(wf.maxY, 3)
	t.equal(wf.firstX, 1)
	t.equal(wf.lastX, 4)

	wf.clear()

	// drawGrid(wf)

	t.end()
})

t.skip('empty data chunks are not being displayed', async t => {
	var wf = createWaveform(gl)
	wf.push([0,0,,0,0, 1,2,,4,5, 5,2.5,,-2.5,-5])
	wf.update({
		width: 10,
		amplitude: [-5, 5],
		range: [0,15]
	})

	wf.render()

	// interactive(wf)
	// show(wf.canvas)

	t.ok(eq(wf, await img('./test/fixture/empty.png'), 'empty-diff'))

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

	t.ok(eq(await img('./test/fixture/xy-1.png'), wf))

	wf.clear()

	t.end()
})

t('first point displays correctly', async t => {
	var wf = createWaveform(gl)
	wf.push(oscillate.sin(1024).map(x => x + 10))

	wf.update({
		width: 5,
		amplitude: [1, 12],
		range: [0, 400]
	})

	wf.render()

	// show(wf.canvas, document)
	t.ok(eq(wf, await img('./test/fixture/first-point.png')))

	wf.clear()

	t.end()
})

t('>1 values does not create float32 noise', async t => {
	var data = oscillate.sin(2048*2*10).map(x => x + 10)

	var wf = createWaveform(gl)
	wf.push(data)

	wf.update({
		width: 5,
		amplitude: [1, 12],
		range: [2048*2*10 - 400, 2048*2*10]
	})

	wf.render()

	// show(wf.canvas, document)
	t.ok(eq(wf, await img('./test/fixture/additive-noises.png')))

	// TODO: test line mode
	// TODO: test negative noise

	wf.clear()

	t.end()
})

t.skip('empty data chunks in range mode do not add variance', async t => {
	// TODO: add range-render empty data test
	t.end()
})

t.skip('timestamp gaps get interpolated by edge values', async t => {
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
	wf.clear()

	t.end()
})

t('huge zoom out value does not create mess with noise', async t => {
	t.end()
})

t('step is automatically detected from the x-y input data', async t => {
	var wf = createWaveform({gl})

	wf.push([
		{x: 109.627085281, y: 206},
		{x: 109.637030867, y: 200},
		{x: 109.647035863, y: 206},
		{x: 109.657047407, y: 206},
		{x: 109.666189798, y: 233},
		{x: 109.676121669, y: 234},
		{x: 109.68640626, y: 230},
		{x: 109.697049701, y: 230},
		{x: 109.707013991, y: 230},
		{x: 109.71643792, y: 230},
		{x: 109.72678661, y: 233},
		{x: 109.736006915, y: 230},
		{x: 109.747039401, y: 230},
		{x: 109.756636245, y: 230},
		{x: 109.766007832, y: 240},
		{x: 109.777052658, y: 240},
		{x: 109.787051592, y: 240},
		{x: 109.797054603, y: 245},
		{x: 109.807053946, y: 245},
		{x: 109.81705083599999, y: 245},
		{x: 109.82705901, y: 245},
		{x: 109.837079929, y: 245},
		{x: 109.84708057, y: 245},
		{x: 109.85704243, y: 230},
		{x: 109.867106952, y: 230},
		{x: 109.877085168, y: 230},
		{x: 109.887081832, y: 230},
		{x: 109.897062207, y: 230},
		{x: 109.907058541, y: 230},
		{x: 109.91703843, y: 230},
		{x: 109.927058731, y: 230},
		{x: 109.93706005, y: 230},
		{x: 109.947060414, y: 230},
	])
	wf.update({
		width: 5,
		amplitude: [200, 250],
		range: [109.6, 110]
	})

	wf.render()

	// show(wf, document)

	t.ok(eq(wf, await img('./test/fixture/xstep.png'), .3))
	wf.clear()

	t.end()
})

t('x-offset fluctuations are ignored', async t => {
	// the reason is
	let wf = createWaveform(gl)

	wf.push([[0,1], [0.49,1.5], [.5, 0], [.75, 2]])

	wf.update({width: 10, xStep: 0.25})
	wf.render()

	let fluctuationsShot = await img(wf)

	// show(wf, document)
	wf.clear()


	// let canvas = document.createElement('canvas')
	// let ctx = canvas.getContext('2d')
	// canvas.width = wf.canvas.width
	// canvas.height = 20
	// document.body.appendChild(canvas)

	// let step = canvas.width / 3
	// ctx.beginPath()
	// for (let i = 0; i <= 3; i++) {
	// 	ctx.moveTo(i * step, 0)
	// 	ctx.lineTo(i * step, canvas.height)
	// }
	// ctx.closePath()
	// ctx.stroke()


	wf.update({data: [1, 1.5, 0, 2], width: 10, xStep: 1})
	wf.render()

	t.ok(eq(fluctuationsShot, wf))
	// show(wf, document)

	t.end()
})

t('support 4-value classical range', async t => {
	let wf = createWaveform(gl)

	wf.push([0,1,2,3])
	wf.update({range: [1,0,3,2]})
	wf.render()

	t.deepEqual(wf.amplitude, [0, 2])

	let shot = await img(wf)

	wf.update({range:[1,3], amplitude: [0,2]})
	wf.render()

	t.ok(eq(shot, wf))

	t.end()
})

t('axis and grids', async t => {
	t.end()
})

t('null-canvas instances do not create multiple canvases')

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


function drawGrid (wf) {
	// draw grid
	let canvas = document.createElement('canvas')
	let ctx = canvas.getContext('2d')
	canvas.width = wf.canvas.width
	canvas.height = wf.canvas.height
	document.body.appendChild(canvas)

	let step = canvas.width / 4
	ctx.beginPath()
	for (let i = 0; i < 4; i++) {
		ctx.moveTo(i * step, 0)
		ctx.lineTo(i * step, canvas.height)
	}
	ctx.closePath()
	ctx.stroke()

}
