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

let count = {}
function oscillate (l, type) {
	if (!count[type]) count[type] = 0
	let arr = Array()
	if (type === 'noise') {
		for (let i = 0; i < l; i++) {
			arr[i] = Math.random() * 2 - 1
		}
	}
	else {
		for (let i = 0; i < l; i++) {
			arr[i] = (osc[type] || osc[config.source])((i + count[type]) / 50)
		}
	}
	count[type] += l
	return arr
}

let config = {
	thickness: 2,
	thicknessRange: [.5, 100],

	// step: 1,
	// stepRange: [.1, 100],

	// color: [245, 166, 198],
	color: [0, 0, 0],
	opacity: .75,
	opacityRange: [0, 1],

	// size: 2e7,
	// size: 512 * 30,
	size: 1024,
	sizeRange: [64, 8192],
	paused: true,

	frequency: 150,
	frequencyRange: [1, 3000],

	// source: 'sine',
	// sourceOptions: [
	// 	'noise',
	// 	'sine',
	// 	'triangle',
	// 	'sawtooth',
	// 	'square',
	// 	'pulse',
	// 	'clausen'
	// 	// mic, url
	// ],
	time: 0,
	total: 0,

	// bg: '#fff',

	// rate: 12,
	// block: 1024
}

let waveform0 = Waveform()
waveform0.update(config)

let canvas = waveform0.canvas;
let h3 = canvas.height / 3
waveform0.update({
	viewport: [0,0, canvas.width, h3],
	color: '#F26C4F'
})

let waveforms = [waveform0]

waveforms.push(
	Waveform(extend({canvas: waveform0.canvas}, config)).update({
		viewport: [0, h3, canvas.width, h3*2],
		color: '#94BA65'
	}),

	Waveform(extend({canvas: waveform0.canvas}, config)).update({
		viewport: [0, h3*2, canvas.width, canvas.height],
		color: '#3A89C9'
	})
)


let controlKit = new ControlKit

controlKit.addPanel({ label: 'Options', width: 280 })
	.addGroup()
		.addSubGroup({ label: 'Appearance' })
			.addSlider(config, 'thickness', 'thicknessRange', {
				onChange: () => {
					waveforms.forEach(waveform => {
						waveform.update({
							thickness: config.thickness
						})
						waveform.render()
					})
				}
			})
			// .addSlider(config, 'step', 'stepRange', {
			// 	onChange: () => {
			// 		waveform.update({
			// 			step: config.step
			// 		})
			// 		waveform.render()
			// 	}
			// })
			.addColor(config, 'color', {
				onChange: v => {
					waveforms.forEach(waveform => {
						waveform.update({
							color: v
						})
						waveform.render()
					})
				},
				colorMode: 'rgb'
			})
			.addSlider(config, 'opacity', 'opacityRange', {
				onChange: () => {
					waveforms.forEach(waveform => {
						waveform.update({
							opacity: config.opacity
						})
						waveform.render()
					})
				}
			})
		.addSubGroup({ label: 'Data' })
			// .addSelect(config, 'sourceOptions', {
			// 	target: 'source',
			// 	label: 'signal',
			// 	onChange: () => {

			// 	}
			// })
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
			.addNumberOutput(config, 'total', {label: 'total #'})
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

	let srctype = ['sine', 'sawtooth', 'noise']

	let start = now()
	waveforms.forEach((waveform, i) => {
		let data = oscillate(config.size, srctype[i])
		// waveform.push([.6,.8,.8,.8, .5,.5,.5,.5, -.5,-.5,-.5,-.5])
		waveform.push(data)
	})
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

	config.total = sz(waveform0.total, true, true)

	controlKit.update()

	raf.cancel(frame)
	frame = raf(() => waveforms.forEach(wf => {
		wf.render()
	}) )
	let interval = 1000 / config.frequency
	!config.paused && setTimeout(tick, interval)
}

tick()


panzoom(waveform0.canvas, e => {
	moved = true

	waveforms.forEach(waveform => {
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
	})

	raf.cancel(frame)
	frame = raf(() => waveforms.forEach(wf => wf.render()))
})
