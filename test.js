'use strict'

const t = require('tape')
const createWaveform = require('./')
const panzoom = require('pan-zoom')
const gl = require('gl')(400, 300)
const eq = require('image-equal')


t.only('empty data chunks are not being displayed', async t => {
	document.body.appendChild(gl.canvas)

	var wf = createWaveform(gl)
	wf.push([0,0,,0,0, 1,2,,4,5, 5,2.5,,-2.5,-5])
	wf.update({
		width: 10,
		amplitude: [-5, 5],
		range: [0,15]
	})

	wf.render()

	interactive(wf)

	t.ok(await eq(wf, './test/fixture/empty.png'))

	// TODO: add condensed empty data test

	t.end()
})

t('arbitrary timestamp', async t => {
	var wf = createWaveform({gl})

	wf.push([
		{x: 10, y: 0},
		{x: 11, y: 10},
		{x: 20, y: 20},
		{x: 21, y: 30}
	])
	wf.update({
		width: 10,
		amplitude: 30,
		range: [0, 30]
	})

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




function interactive(wf, o) {
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
