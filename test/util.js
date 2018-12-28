'use strict'

let panzoom = require('pan-zoom')
const isBrowser = require('is-browser')

module.exports = {
	timeout, interactive, drawGrid
}

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
		wf.clear()
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
