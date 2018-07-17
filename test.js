'use strict'

import Waveform from './'
import h from 'jsxify'
import extend from 'object-assign'
import osc from 'periodic-function/sine'

document.body.style.margin = 0

let state = {
	data: ((l) => {
		let arr = Array(l)
		for (let i = 0; i < l; i++) {
			arr[i] = osc(i/l)
		}
		return arr
	})(512),

	thickness: 40,

	line: '#888',
	// bg: '#fff',

	// rate: 12,
	// block: 1024
}

let waveform = new Waveform()

waveform.update(state)
waveform.render()
