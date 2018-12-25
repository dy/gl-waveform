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
const seed = require('seed-random')
const almost = require('almost-equal')

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
	// t.equal(wf.firstX, 1)
	// t.equal(wf.lastX, 4)

	wf.clear()

	t.end()
})

t('calibrate step/end: thickness should not bend', async t => {
	var wf = createWaveform(gl)

	wf.push([0, 1, 1, -1, 1, 0])
	wf.thickness = 10
	wf.amplitude = [-2, 2]
	wf.viewport = [100,100,200,200]
	wf.range = [-.5, 6.5]

	// calibrate end
	wf.mode = 'range'
	wf.render()
	t.ok(eq(await img`./test/fixture/calibrate-end.png`, wf, .3))
	wf.clear()

	wf.range = [1, 7]
	wf.mode = 'range'
	wf.render()
	// document.body.appendChild(wf.canvas)
	// interactive(wf)
	t.ok(eq(await img`./test/fixture/calibrate-end-range.png`, wf, .3))
	wf.clear()

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

t.skip('xy noises case', async t => {
	// TODO: enable time data structure

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
		{x: 1028, y: 182}
	])

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
	var data = oscillate.sin(1024)
	wf.push(data
		.map(x => x + 10)
	)
	wf.update({
		width: 5,
		amplitude: [1, 12],
		range: [0, 400],
		mode: 'range'
	})

	wf.render()

	// document.body.appendChild(wf.canvas)
	// interactive(wf)
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
	t.ok(eq(wf, await img('./test/fixture/additive-noises.png'), .28))

	// TODO: test line mode
	// TODO: test negative noise

	wf.clear()

	t.end()
})

// TODO
t.skip('big values do not get accumulated', async t => {
	var f32 = require('to-float32')

	// var createWaveform = require('./debug')
	var wf = createWaveform(gl)

	console.time(1)
	let arr = []
	for (let i = 0; i < 50000; i++) {
		arr.push(1027)
	}
	for (let i = 0; i < 50000; i++) {
		arr.push(1007)
	}
	for (let i = 0; i < 50000; i++) {
		arr.push(1017)
	}
	for (let i = 0; i < 50000; i++) {
		arr.push(1147)
	}
	for (let i = 0; i < 500000; i++) {
		arr.push(1011)
	}
	// for (let i = 0; i < 50000; i++) {
	// 	arr.push(1170)
	// }
	for (let i = 0; i < 100000; i++) {
		arr.push(1011)
	}
	wf.push(arr)

	document.body.appendChild(wf.canvas)
	interactive(wf, x => {
		console.log(wf.range)
	})

	wf.update({amplitude: [1005, 1171], width: 1})
	wf.render()

	// second-texture start is ok

	t.end()
})

t('multipass: single txt line mode', async t => {
	let data = oscillate.sin(16, {f: 5000})
	let wf = createWaveform(gl)

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

	wf.range = [10, 26]
	wf.render()
	t.ok(eq(await img`./test/fixture/multipass-16l.png`, wf))
	wf.clear()

	wf.range = [-8, 24]
	wf.render()
	t.ok(eq(await img`./test/fixture/multipass-16c.png`, wf))
	wf.clear()

	// document.body.appendChild(wf.canvas)
	// interactive(wf, c => {})

	t.end()
})

t.only('multipass: single txt range mode', async t => {
	let data = oscillate.sin(16, {f: 5000})
	let wf = createWaveform(gl)
	wf.mode = 'range'

	wf.update({shape: [4, 4], thickness: 10, amplitude: [-3, 3]})
	wf.push(data)

	wf.render()
	// t.ok(eq(await img`./test/fixture/multipass-16.png`, wf))
	// wf.clear()

	// wf.range = [-6, 10]
	// wf.render()
	// t.ok(eq(await img`./test/fixture/multipass-16r.png`, wf))
	// wf.clear()

	// wf.range = [-10, 6]
	// wf.render()
	// t.ok(eq(await img`./test/fixture/multipass-16r2.png`, wf))
	// wf.clear()

	// wf.range = [10, 26]
	// wf.render()
	// t.ok(eq(await img`./test/fixture/multipass-16l.png`, wf))
	// wf.clear()

	// wf.range = [-8, 24]
	// wf.render()
	// t.ok(eq(await img`./test/fixture/multipass-16c.png`, wf))
	// wf.clear()

	document.body.appendChild(wf.canvas)
	interactive(wf, c => {})

	t.end()
})

t('multipass: 2 txt join', async t => {
	// let data = oscillate.sin(24, {f: 5000})
	// let data = oscillate.sin(64, {f: 5000})
	// let data = oscillate.sin(32, {f: 5000})

	let wf = createWaveform(gl)

	wf.update({shape: [4, 4], thickness: 10, amplitude: [3, -3]})
	wf.push(data)
	wf.render()

	document.body.appendChild(wf.canvas)
	interactive(wf)


	t.end()
})

t.skip('shared texture rendering', async t => {

	// TODO: various-size textures

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

t.skip('big zoom out value does not create wrong image')

t('push numbers / multiple items', t => {
	let wf = createWaveform(gl)

	wf.push(1,2,3).render()

	t.equal(wf.total, 3)

	t.end()
})

t.skip('step is automatically detected from the x-y input data', async t => {
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

t.skip('x-offset fluctuations are ignored', async t => {
	// the reason is
	let wf = createWaveform(gl)

	wf.push([[0,1], [0.49,1.5], [.5, 0], [.75, 2]])

	wf.update({width: 10, xStep: 0.25})
	wf.render()

	let fluctuationsShot = await img(wf)

	// show(wf, document)
	wf.clear()

	// drawGrid(wf, 4)


	wf.update({data: [1, 1.5, 0, 2], width: 10, xStep: 1})
	wf.render()
	// show(wf, document)

	t.ok(eq(fluctuationsShot, wf))

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

t.skip('null-canvas instances do not create multiple canvases')

t.skip('calibrate step to pixels')

t.skip('calibrate data range')

t.skip('calibrate thickness to pixels')

t.skip('line ends cover viewport without change')

t('texture join: no seam', async t => {
	let wf = createWaveform(gl)
	wf.push(oscillate.sin(515*512*3))
	wf.update({range: [512 * 512 - 200, 512*512 + 200]})
	wf.render()
	// show(wf, document)

	wf.clear()

	t.end()
})

t.skip('texture resets sum2 error')

t.skip('negative data range is displayed from the tail')

t.skip('line/range mode is switched properly')

t.skip('2σ thickness scheme')

t('fade out', async t => {
	let wf = createWaveform(gl)

	wf.update({data: [1,1,1,1,1,1,1,1,1,1,1,-.1,1.1,0,1,.1,.9,.2,.8,.3,.7,.4,.6,0,0,0,0], amp: [-1, 2], width: 20, color: 'blue'})
	wf.render()

	// show(wf, document)
	t.ok(eq(wf, await img(`./test/fixture/fade.png`), .32) )

	wf.clear()

	t.end()
})

t('fade crease', async t => {
	let wf = createWaveform(gl)

	let data = []
	// for (let i = 0; i < 100; i++) {
		data.push(.9, 0, .5, -.5)
		data.push(null, null, null, null, null, null)
		data.push(-.5, .5, 0, .9)
	// }

	wf.update({data,
		amp: [-1, 2],
		width: 32,
		color: 'rgb(60,120,230)',
		range: [-17, 17]
	})
	wf.render()

	// show(wf, document)
	t.ok(eq(wf, await img(`./test/fixture/fade-crease.png`), .32) )

	wf.clear()

	t.end()
})

t.skip('too thick lines get limited')

t('line fade', async t => {
	let random = seed('fade')
	let wf = createWaveform(gl)

	let data = []
	for (let i = 0; i < 100; i++) {
		// data.push(1, 0, .5, -.5)
		data.push(random())
	}

	wf.update({data,
		amp: [-1, 2],
		width: 10,
		color: 'rgb(60,120,230)'
	})
	wf.render()

	// show(wf, document)
	t.ok(eq(wf, await img(`./test/fixture/line-fade.png`), .17) )

	wf.clear()

	t.end()
})

t.skip('fade artifacts', async t => {
	let random = seed('fade')
	let wf = createWaveform(gl)

	let data = []
	for (let i = 0; i < 100; i++) {
		data.push(random())
	}

	wf.update({
		data,
		mode: 'range',
		amp: [-1, 2],
		width: 10,
		// range: [-27.71370813443843, 119.30162375421158],
		// range: [3.253718981638178, 56.87241669933188],
		// range: [-116.81489600471932, 149.0946366945476],
		color: 'rgb(60,120,230)'
	})
	wf.render()

	document.body.appendChild(wf.canvas)

	interactive(wf, ({range}) => {
		console.log(range)
	})

	// show(wf, document)
	// t.ok(eq(wf, await img(`./test/fixture/line-fade.png`), .17) )

	// wf.clear()

	t.end()
})

t('set data at specific offset', async t => {
	let wf = createWaveform(gl)

	wf.set([0,2,1,3])
	wf.thickness = 4
	wf.color = [255,255,0,255]
	wf.render()

	wf.set([3], 1)
	wf.clear().render()

	// show(wf, document)
	t.ok(eq(await img`./test/fixture/set.png`, wf))

	// set the future
	wf.set([1,1], 5).clear().render()
	t.ok(eq(await img`./test/fixture/set-future.png`, wf, .3))

	t.end()
})

t.skip('gl-waveform-test: single value sequence', async t => {
	var data = [
		[69290.117031919, 890.6322520922428],
		[69290.127032827, 886.0405536100012],
		[69290.137032547, 881.3602518107634],
		[69290.147031987, 876.5918147208089],
		[69290.157031148, 871.7357191798733],
		[69290.167031148, 866.7924507934636],
		[69290.177031426, 861.7625038842991],
		[69290.187031146, 856.6463814428793],
		[69290.197031146, 851.4445950771849],
		[69290.207031145, 846.1576649615174],
		[69290.217031214, 840.786119784483],
		[69290.227033239, 835.330496696123],
		[69290.237031073, 829.791341254199]
	]

	// detect avg step
	let sum = 0
	for (let i = 1; i < data.length; i++) {
		sum += data[i][0] - data[i - 1][0]
	}
	let avgStep = sum / (data.length - 1)


	let wf = createWaveform(gl)

	let lastStepX = null
	for (let i = 0; i < data.length; i++) {
		wf.push(data[i][1])
	}

	// let o = wf.calc()
	// t.equal(o.stepX, avgStep, 'step is averaged')
	// t.equal(o.total, data.length, 'total is correct')
	// t.equal(wf.firstX, data[0][0], 'first x is correct')
	// t.equal(wf.lastX, data[data.length - 1][0], 'last x is correct')

	// wf.update({range: [69290, 69290.3]})
	wf.render()

	show(wf, document)
	// t.ok(eq(wf, await img`./test/fixture/average-step.png` , .2), 'avg step is ok')

	// wf.clear()

	t.end()
})

t.skip('single-entry no-render', async t => {
	let data = [
		{x: 76043.312010606, y: 1005},
		{x: 76043.322010886, y: 1008},
		{x: 76043.332010469, y: 1011},
		{x: 76043.342012985, y: 1011},
		// {x: 76043.35203813, y: 1027},
		// {x: 76043.362015781, y: 1027},
		// {x: 76043.372016621, y: 1027},
		// {x: 76043.382028635, y: 1027},
		// {x: 76043.39202291, y: 1027},
		// {x: 76043.402012644, y: 1027},
		// {x: 76043.412026195, y: 1027},
		// {x: 76043.422005663, y: 1027},
		// {x: 76043.432014185, y: 1027},
		// {x: 76043.442009367, y: 1027},
		// {x: 76043.452018099, y: 1027},
		// {x: 76043.462008183, y: 1027},
		// {x: 76043.472007067, y: 1027},
		// {x: 76043.482010002, y: 1027},
		// {x: 76043.492013635, y: 1027},
		// {x: 76043.502008049, y: 1027}
	]

	let wf = createWaveform(gl)
	wf.clear()

	data.forEach(xy => {
		wf.push([xy])
		wf.clear()
		wf.render()
	})

	// show(wf, document)
	t.ok(eq(await img`./test/fixture/single-value.png`, wf), 'single value/clear is ok')

	t.end()
})

t.skip('gl-waveform-test: values from the past')

t.skip('gl-waveform-test: noise ', t => {
	let data = require('./fixture/f32-noise-case.json').slice(12000)


	let wf = createWaveform(gl)

	for (let i = 0; i < data.length; i++) {
		wf.push([data[i]])
	}

	wf.update({amplitude: [1000, 1100], range: [78045, 78050]})
	wf.render()
	interactive(wf)

	document.body.appendChild(wf.canvas)

	t.end()
})

t.skip('multipass rendering for large zoom levels', t => {
	let wf = createWaveform()

	interactive(wf)

	wf.update({
		data: generate.sine(1e5, {frequency: 50})
	})

	wf.destroy()

	t.end()
})

t.skip('tail rendering')

t.skip('head rendering')

t.skip('correct everything for line mode')

t.skip('large data has no artifacts or noise')

t.skip('viewport: correct translate, thickness, angle')

t.skip('panning does not change image')

t.skip('empty data does not break rendering')

t.skip('waveform creation is quick enough (faster than 200ms)')

t.skip('compensate fluctuations of wrongly detected stepX')

t.skip('range mode fade, esp. on varying sdevs')

t.skip('multipass rendering')

t('autodetects range', async t => {
	let wf = createWaveform(gl)

	wf.push(1,2,3)
	t.deepEqual(wf.range, [0,2])
	wf.render()
	wf.push(1,2,3)
	await timeout(100)
	t.deepEqual(wf.range, [0,5])

	t.end()
})

function timeout (n) {
	return new Promise(function (ok) {
		setTimeout(ok, n)
	})
}

function interactive(wf, cb) {
	if (!isBrowser) return

	panzoom(wf.canvas, e => {
		let range = wf.range ? wf.range.slice() : wf.calc().range

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

		if (cb) cb({ range })
		wf.update({ range })
		wf.render()
	})
}

function drawGrid (wf, n) {
	// draw grid
	let canvas = document.createElement('canvas')
	let ctx = canvas.getContext('2d')
	canvas.width = wf.canvas.width
	canvas.height = wf.canvas.height
	document.body.appendChild(canvas)

	let step = canvas.width / (n - 1)
	ctx.beginPath()
	for (let i = 0; i < n; i++) {
		ctx.moveTo(i * step, 0)
		ctx.lineTo(i * step, canvas.height)
	}
	ctx.closePath()
	ctx.stroke()
}
