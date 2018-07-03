'use strict'

import Waveform from './'
// import AudioSource from 'app-audio'
// import FpsIndicator from 'fps-indicator'
// import {Panel, Volume, Group, Range} from 'settings-panel'
// import package from './package.json'
// import AvisLogo from '@a-vis/logo'
// import Drawer from 'rmc-drawer'
import h from '../../jsxify'
import extend from 'object-assign'

let state = {
	data: [0, .1, .2, .3, .4, .5],

	width: 4,

	line: '#000',
	bg: '#fff',

	rate: 12,
	block: 1024
}

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
	<div container={document.body}>
		<canvas id="main" />
		<Waveform canvas="#main" data={state.data} push={o.push}/>
	</div>
	)
})(state)
