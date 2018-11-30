'use strict'

let Waveform = require('../index')
let extend = require('object-assign')
let osc = require('periodic-function')
let panzoom = require('pan-zoom')
let createFPS = require('fps-indicator')
let ControlKit = require('controlkit')
let raf = require('raf')
let now = require('performance-now')
let sz = require('prettysize')


document.body.innerHTML = `
	<style>
		* {
			box-sizing: border-box;
			text-rendering: optimizeLegibility;
		}
		body {
			font-family: Roboto, Helvetica, Arial, sans-serif;
			color: #F6F6F6;
			margin: 0;
			height: 100vh;
			background: radial-gradient(80vw at 33% 0%, rgba(255, 255, 255, 0.13) 0%, rgba(255, 255, 255, 0) 100%), #4f5252;
		}
		.container {
			overflow: hidden;
			max-width: 1024px;
			min-width: 320px;
			display: block;
			position: absolute;
			top: 0;
			left: 0;
			bottom: 0;
			right: 0;
			margin: auto auto;
			height: 80vh;
			width: 80vw;
			padding-right: 280px;

			background: radial-gradient(660.00px at 50% 102.92%, rgba(157, 173, 167, 0.465) 0%, rgba(139, 157, 170, 0.035) 100%), #3A3939;
			/* paper */
			box-shadow: 0px 8px 28px rgba(52, 57, 72, 0.5), 0px 1px 10px rgba(43, 42, 42, 0.17);
			border-radius: 6px;
		}
		.canvas {
			width: calc(100% - 280px - 2.4rem);
			height: 60%;
			position: absolute;
			top: 9rem;
			left: 2.4rem;
		}
		.header {
			position: absolute;
			padding-left: 2.4rem;
			padding-top: 2.4rem;
			z-index: 2;
		}
		.header h1 {
			line-height: 1;
			margin: -.2rem 0 0 0;
			font-size: 1.2rem;
			font-weight: 500;
		}
		.nav {
			padding-top: .8rem;
		}
		a {
			color: #d0d0d0;
			text-decoration: none;
			font-size: .8rem;
			font-weight: 200;
		}
		a:hover {
			color: #f0f0f0;
		}
		.nav a {
			line-height: 1.25rem;
			display: block;
			padding-right: .8rem;
			text-transform: lowercase;
		}
		.nav a.active {
			font-weight: 500;
			color: #f0f0f0;
		}
		.nav a.active:before {
			content: '';
			width: .16rem;
			background: #808080;
			height: 1.2rem;
			left: 0;
			position: absolute;
		}
		.panel {
		}
		.fps-indicator {

		}
		.fps-text {
			font-size: .8rem;
			margin-left: .2rem;
			color: #d0d0d0;
			font-weight: 200;
		}
		.footer {
			color: #d0d0d0;
			font-weight: 200;
			font-size: .8rem;
			position: absolute;
			bottom: 1.6rem;
			line-height: 1rem;
			left: 2.4rem;
		}
		.footer a {
			color: #f0f0f0;
			font-weight: 400;
			font-style: italic;
		}
		.small-caps {
			font-size: .875em;
			letter-spacing: .1ex;
		}
		.footer a:hover {
			color: white;
		}
	</style>

	<section class="container">
		<header class="header">
			<h1>gl-waveform</h1>
			<nav class="nav">
				<a href="#about">About</a>
				<a class="active" href="#examples">example</a>
				<a href="#github">Github</a>
			</nav>
		</header>
		<canvas class="canvas" id="traces"></canvas>
		<canvas class="canvas" id="pick"></canvas>
		<footer class="footer">Created by <a class="small-caps" href="https://github.com/dy">DY</a>
			for <a href="https://github.com/audiojs">audiojs</a> and fine folks.</footer>
	</section>
`
createFPS({container: '.container', position: 'bottom-right', style: 'position: absolute; padding: 0 2.4rem 1.6rem 2.4rem'})


// generate data function
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


// basic trace/panel config
let config = {
	thickness: 1,
	thicknessRange: [.5, 100],

	// step: 1,
	// stepRange: [.1, 100],

	// color: [245, 166, 198],
	color: [0, 0, 0],
	opacity: .75,
	opacityRange: [0, 1],

	// size: 2e7,
	// size: 512 * 300,
	size: 1024,
	sizeRange: [64, 8192],
	paused: false,

	frequency: 150,
	frequencyRange: [1, 3000],

	amp: [-1.5, 1.5],

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
	// pxStep: .5
}




// create waveform traces
var canvas = document.getElementById('traces')
canvas.width = parseFloat(getComputedStyle(canvas).width)
canvas.height = parseFloat(getComputedStyle(canvas).height)
let waveform0 = Waveform(canvas)
waveform0.update(config)

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


// add picking canvas
let canvas2d = document.getElementById('pick')
let ctx2d = canvas2d.getContext('2d')
let w = waveform0.canvas.width
let h = waveform0.canvas.height
canvas2d.width = w
canvas2d.height = h

document.addEventListener('mousemove', e => {
	ctx2d.clearRect(0, 0, w, h)

	waveforms.forEach(wf => {
		// let wf = waveforms[1]
		let o = wf.pick(e)
		if (!o) return

		let {average, offset, y, x, sdev} = o

		if (average == null) return

		ctx2d.fillStyle = 'rgba(255,0,0,.5)'
		ctx2d.fillRect(x - 3, y - 3, 6, 6)

		ctx2d.fillStyle = 'rgba(255,255,255,1)'
		ctx2d.fillText(average.toFixed(2), x + 10, y + 3)
	})
})


// setup control panel
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
			.addRange(config, 'amp', {
				label: 'amp range',
				step: .1,
				onChange: () => {
					waveforms.forEach(wf => wf.update({amp: config.amp}).render())
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
			.addNumberOutput(config, 'total', {label: 'total length'})
			.addButton('Pause / resume', () => {
				config.paused = !config.paused

				if (!config.paused) tick()
			})
			// .addValuePlotter(config, 'time', {
			// 	label: 'packet time',
			// 	height: 80,
			// 	resolution: 1,
			// })

var container = document.querySelector('.container').appendChild(
	document.getElementById('controlKit')
)


// setup dynamic data generating/rendering routine
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
		waveforms.forEach(waveform => {
			let range = waveform.range.slice()
			let span = range[1] - range[0]
			range[0] = waveform.total - span
			range[1] = waveform.total

			waveform.update({ range })
		})
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


// handle pan/zoom
panzoom(ctx2d.canvas, e => {
	// clear pick markers
	ctx2d.clearRect(0, 0, w, h)

	moved = true

	waveforms.forEach(waveform => {
		let range = waveform.range.slice()
		let canvas = waveform.canvas

		let w = canvas.offsetWidth
		let h = canvas.offsetHeight

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

		waveform.update({ range })
	})

	raf.cancel(frame)
	frame = raf(() => waveforms.forEach(wf => wf.render()))
})


window.addEventListener('resize', () => {
	let canvas = waveform0.canvas

	// take over canvas2d size
	canvas2d.width = canvas.width
	canvas2d.height = canvas.height

	waveforms.forEach((waveform, i) => {
		let vp = waveform.viewport
		vp.width = canvas2d.width
		waveform.update({
			viewport: vp,
		})
		waveform.render()
	})
})
