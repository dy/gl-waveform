'use strict'

import Waveform from './'
import extend from 'object-assign'
import osc from 'periodic-function'
import panzoom from 'pan-zoom'
import FPS from 'fps-indicator'
import ControlKit from 'controlkit'
import raf from 'raf'
import now from 'performance-now'
import sz from 'prettysize'

FPS()

document.body.style.margin = 0

let count = 0
function oscillate (l) {
	let arr = Array()
	for (let i = 0; i < l; i++) {
		arr[i] = osc[config.source]((i + count) / 50)
	}
	count += l
	return arr
}

let config = {
	thickness: 20,
	thicknessRange: [.5, 100],

	step: 1,
	stepRange: [.1, 100],

	color: [245, 166, 198],
	opacity: .75,
	opacityRange: [0, 1],

	// size: 2e7,
	size: 512 * 20,
	sizeRange: [64, 8192],
	paused: true,

	frequency: 150,
	frequencyRange: [1, 3000],

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
	total: 0,


	// bg: '#fff',

	// rate: 12,
	// block: 1024
}


let waveform = Waveform()
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
			.addSlider(config, 'step', 'stepRange', {
				onChange: () => {
					waveform.update({
						step: config.step
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
			.addSlider(config, 'opacity', 'opacityRange', {
				onChange: () => {
					waveform.update({
						opacity: config.opacity
					})
					waveform.render()
				}
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
			.addSlider(config, 'frequency', 'frequencyRange', {
				dp: 0, step: 1,
				label: 'frequency, Hz',
				onChange: () => {

				}
			})
			.addNumberOutput(config, 'total')
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
	waveform.push([.6,.8,.8,.8, .5,.5,.5,.5, -.5,-.5,-.5,-.5])
	// waveform.push(data)
	let end = now()
	config.time = end - start

	// recalc range to show tail
	if (!moved) {
		// let range = waveform.range.slice()
		// let span = range[2] - range[0]
		// range[0] = waveform.total - span
		// range[2] = waveform.total

		// waveform.update({ range })
	}

	config.total = sz(waveform.total, true, true)

	controlKit.update()

	raf.cancel(frame)
	frame = raf(() => waveform.render())

	let interval = 1000 / config.frequency
	!config.paused && setTimeout(tick, interval)
}

tick()


panzoom(waveform.canvas, e => {
	moved = true

	let range = waveform.range.slice()
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
