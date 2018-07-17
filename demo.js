'use strict'

import Waveform from './'
// import AudioSource from 'app-audio'
// import FpsIndicator from 'fps-indicator'
// import {Panel, Volume, Group, Range} from 'settings-panel'
// import package from './package.json'
// import AvisLogo from '@a-vis/logo'
// import Drawer from 'rmc-drawer'
import h from 'jsxify'
import extend from 'object-assign'
import osc from 'periodic-function/sine'
import pp from 'react-powerplug'

let Toggle = pp.Toggle

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
	bg: '#fff',

	rate: 12,
	block: 1024
}

let Waveform = require()

;(function render (o) {
	extend(state, o);

	/* @jsx h */
	(
	// 	<div class="a">test</div>
	// 	<AudioSource ondata={d => render({push: d})}/>
	// 	<FpsIndicator text="false"/>
	// 	<AvisLogo href={package.repository.url}/>
	// 	<Drawer>
	// 		<Panel closed onchange={render}>
	// 			<Volume id="width" min=0 max=100 value={state.width} />
	// 			<Range id="amplitude" symmetric min=-10 max=10 value={[-state.amplitude, state.amplitude]} />
	// 			// TODO: provide multicolor mode
	// 			<Group label="Color">
	// 				<Color id="line" value={state.line} width="half" />
	// 				<Color id="bg" value={state.bg} width="half" />
	// 			</Group>
	// 			<Group label="Update">
	// 				<Number id="rate" value={state.rate} unit="times/sec" width="half" />
	// 				<Number id="size" value={state.block} unit="samples" width="half" />
	// 			</Group>
	// 		</Panel>
	// 	</Drawer>
	// 	<Bar/>
	// <document.body>
	// 	<Waveform push={o.data} color={o.line} thickness={o.thickness}/>
	// </document.body>
	)
})(state)
