'use strict'

import Waveform from './'
import extend from 'object-assign'
import osc from 'periodic-function/sine'
import panzoom from 'pan-zoom'
import FPS from 'fps-indicator'
import ControlKit from 'controlkit'
import raf from 'raf'

FPS()

document.body.style.margin = 0

let count = 0
function oscillate (l) {
	let arr = Array()
	for (let i = 0; i < l; i++) {
		arr[i] = osc((i + count) / 500)
	}
	count += l
	return arr
}

let config = {
	thickness: 2,
	thicknessRange: [1, 40],

	color: [255, 0, 0],

	size: 512,
	sizeRange: [64, 8192],

	interval: 500,
	intervalRange: [10, 3000],

	source: 'Sine',
	sourceOptions: ['Sine', 'Saw', 'Square', 'Noise', 'Mic', 'Url'],
	time: 0
	// bg: '#fff',

	// rate: 12,
	// block: 1024
}



let controlKit = new ControlKit;

controlKit.addPanel({ width: 280 })
	.addGroup()
		.addSubGroup({ label: 'Appearance' })
			.addSlider(config, 'thickness', 'thicknessRange', {
				onChange: () => {
					waveform.update({
						thickness: config.thickness
					})
					waveform.render()
				}
			})
			.addColor(config, 'color', {
				onChange: v => {
					waveform.update({
						color: v
					})
					waveform.render()
				},
				colorMode: 'rgb'
			})
		.addSubGroup({ label: 'Data stream' })
			.addSelect(config, 'sourceOptions', {
				target: 'source',
				label: 'signal',
				onChange: () => {

				}
			})
			.addSlider(config, 'size', 'sizeRange', {
				dp: 0, step: 1,
				label: 'packet size',
				onChange: () => {

				}
			})
			.addSlider(config, 'interval', 'intervalRange', {
				dp: 0, step: 1,
				label: 'packet interval',
				onChange: () => {

				}
			})
			.addValuePlotter(config, 'time', {
				label: 'packet time',
				height: 80,
				resolution: 1,
			})



let waveform = new Waveform()

waveform.update(config)


;(function tick() {
	let data = oscillate(config.size)
	waveform.push(data)

	// recalc range to show tail
	// let range = waveform.range.slice()
	// let span = range[2] - range[0]
	// range[0] = waveform.total - span
	// range[2] = waveform.total
	waveform.update({ range: [0, 512] })

	// waveform.update({ range })

	waveform.render()

	// setTimeout(tick, config.interval)
})()

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
