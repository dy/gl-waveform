import osc = require('audio-oscillator')
import Waveform = require('../index')
import raf = require('raf')

document.body.style.background = 'black'

let mainWave : Waveform = new Waveform()

let topWave = Array(4)
let botWave = Array(4)

mainWave.range = -1024
mainWave.viewport = [
	mainWave.viewport[0],
	300,
	mainWave.viewport[2],
	400
]
mainWave.color = 'white'
mainWave.thickness = 2

topWave[0] = new Waveform(mainWave)
topWave[0].range = -512
topWave[0].viewport = [
	mainWave.viewport[0],
	150,
	mainWave.viewport[2],
	250
]
topWave[1] = new Waveform(mainWave)
topWave[1].range = -256
topWave[1].viewport = [
	mainWave.viewport[0],
	0,
	mainWave.viewport[2],
	100
]

let data = Array(2)
;(function tick () {
	osc.sin(data, 440)
	mainWave.push(data)
	mainWave.render()
	topWave[0].render()
	topWave[1].render()

	raf(tick)
})()
