'use strict'

import Waveform from './'
import extend from 'object-assign'
import osc from 'periodic-function'
import panzoom from 'pan-zoom'
import FPS from 'fps-indicator'
import ControlKit from 'controlkit'
import raf from 'raf'
import now from 'performance-now'

FPS()

document.body.style.margin = 0

let count = 0
function oscillate (l) {
	let arr = Array()
	for (let i = 0; i < l; i++) {
		arr[i] = osc[config.source]((i + count) / 500)
	}
	count += l
	return arr
}

let config = {
	thickness: 2,
	thicknessRange: [1, 40],

	color: [0, 0, 0],

	size: 256,
	sizeRange: [64, 8192],

	interval: 150,
	intervalRange: [10, 3000],

	source: 'sine',
	sourceOptions: [
		'noise',
		'sine',
		'triangle',
		'sawtooth',
		'square',
		'pulse',
		'clausen'
		// mic, url
	],
	time: 0,

	paused: false

	// bg: '#fff',

	// rate: 12,
	// block: 1024
}


let waveform = new Waveform()
waveform.update(config)


let controlKit = new ControlKit

controlKit.addPanel({ label: 'Options', width: 280 })
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
		.addSubGroup({ label: 'Data' })
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
			.addNumberOutput(waveform, 'total')
			.addButton('Pause / resume', () => {
				config.paused = !config.paused

				if (!config.paused) tick()
			})
			// .addValuePlotter(config, 'time', {
			// 	label: 'packet time',
			// 	height: 80,
			// 	resolution: 1,
			// })


let moved = false, frame

function tick() {
	let data = oscillate(config.size)

	let start = now()
	waveform.push(data)
	let end = now()
	config.time = end - start

	// recalc range to show tail
	if (!moved) {
		let range = waveform.range.slice()
		let span = range[2] - range[0]
		range[0] = waveform.total - span
		range[2] = waveform.total

		waveform.update({ range })
	}

	controlKit.update()

	raf.cancel(frame)
	frame = raf(() => waveform.render())

	!config.paused && setTimeout(tick, config.interval)
}

tick()


panzoom(waveform.canvas, e => {
	moved = true

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

	raf.cancel(frame)
	frame = raf(() => waveform.render())
})
