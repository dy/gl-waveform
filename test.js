'use strict'

import Waveform from './'
import extend from 'object-assign'
import osc from 'periodic-function/sine'
import panzoom from 'pan-zoom'
import FPS from 'fps-indicator'

FPS()

document.body.style.margin = 0

let state = {
	data: ((l) => {
		let arr = Array(l)
		for (let i = 0; i < l; i++) {
			arr[i] = osc(i / 100)
		}
		return arr
	})(512 * 100),

	thickness: 40,

	step: 5,

	line: '#abc',

	// bg: '#fff',

	// rate: 12,
	// block: 1024
}

let waveform = new Waveform()

waveform.update(state)
waveform.render()


panzoom(waveform.canvas, e => {
	let range = waveform.range
	let canvas = waveform.canvas

	let w = canvas.offsetWidth
	let h = canvas.offsetHeight

	let rx = e.x / w
	let ry = e.y / h

	let xrange = range[2] - range[0],
		yrange = range[3] - range[1]

	if (e.dz) {
		let dz = e.dz / w
		range[0] -= rx * xrange * dz
		range[2] += (1 - rx) * xrange * dz

		// range[1] -= ry * yrange * dz
		// range[3] += (1 - ry) * yrange * dz

		range[1] -= (1 - ry) * yrange * dz
		range[3] += ry * yrange * dz
	}

	range[0] -= xrange * e.dx / w
	range[2] -= xrange * e.dx / w
	// range[1] -= yrange * e.dy / h
	// range[3] -= yrange * e.dy / h
	range[1] += yrange * e.dy / h
	range[3] += yrange * e.dy / h

	waveform.update({ range })
	waveform.render()
})
