'use strict'

import Waveform from './'
import extend from 'object-assign'
import osc from 'periodic-function/sine'
import panzoom from 'pan-zoom'
import FPS from 'fps-indicator'
import ControlKit from 'controlkit'

FPS()

document.body.style.margin = 0


let data = ((l) => {
	let arr = Array(l)
	for (let i = 0; i < l; i++) {
		arr[i] = osc(i / 500)
	}
	return arr
})(1024 * 10)

let state = {
	thickness: 10,
	thicknessRange: [1, 40],
	max: 5,
	min: -5,

	line: [255, 0, 0],

	// bg: '#fff',

	// rate: 12,
	// block: 1024
}



let controlKit = new ControlKit;

controlKit.addPanel()
	.addGroup()
		.addSubGroup()
			.addSlider(state, 'thickness', 'thicknessRange', {
				onChange: () => {
					waveform.update({
						thickness: state.thickness
					})
					waveform.render()
				}
			})
            .addColor(state, 'line', {
            	onChange: v => {
            		waveform.update({
            			color: v
            		})
            		waveform.render()
            	},
            	colorMode: 'rgb'
            })



let waveform = new Waveform()

waveform.push(data)
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
