import osc = require('audio-oscillator')
import Waveform = require('../index')
import raf = require('raf')
import fps = require('fps-indicator')
import pz = require('pan-zoom')

// fps({position: 'bottom-left', color: 'white'})


document.body.style.background = 'black'



// master waveform stores the data
let masterWave : Waveform = new Waveform()
masterWave.color = 'white'
masterWave.thickness = 2

// create set of waveforms
let h = 28, pad = 28
let waves = Array(Math.floor(window.innerHeight / h))
h = (window.innerHeight - pad * 2) / waves.length
let half = Math.floor(waves.length / 2)
for (let i = 0; i < waves.length; i++) {
	waves[i] = new Waveform(masterWave)
	waves[i].viewport = [
		masterWave.viewport[0],
		i * h + pad,
		masterWave.viewport[2],
		i * h + h + pad
	]
	let amp = [-3, 3]
	waves[i].amplitude = amp

	if (i < half) {
		waves[i].origRange = waves[i].range = -(256 * (i + 1))
		// waves[i].opacity = 1 - (i + 1) * .025
		// waves[i].thickness = 3 - (i + 1) * .17
		// waves[i].amplitude = [
		// 	amp[0] - (i) * .5,
		// 	amp[1] + (i) * .5
		// ]
	}
	else {
		waves[i].origRange = waves[i].range = -(256 * (waves.length - i))
		// waves[i].opacity = 1 - (waves.length - i) * .025
		// waves[i].thickness = 3 - (waves.length - i) * .17
		// waves[i].amplitude = [
		// 	amp[0] - (waves.length - i - 1) * .5,
		// 	amp[1] + (waves.length - i - 1) * .5
		// ]
	}
}

// update set of waveforms
function render () {
	waves.forEach(wave => {
		wave.render()
	})
}


pz(masterWave.canvas, e => {
	waves.forEach(wf => {
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

		wf.range = -(range[1] - range[0])
	})
})


// master waveform update loop
let data = osc.saw(2048 * 10, 440)
masterWave.push(data)
for (let i = 0; i < 2048*10 - 4; i++) {
	data.shift()
}
;(function tick () {
	osc.saw(data)
	masterWave.push(data)

	render()

	raf(tick)
})()
