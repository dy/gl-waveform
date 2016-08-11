const createSettings = require('../settings-panel');
const createWaveform = require('./src/core');
const insertCss =  require('insert-styles');

insertCss(`
	body {
		padding: 0;
		margin: 0;
	}
`);



let settings = createSettings([
	{id: 'log', label: 'Log', type: 'checkbox', value: true, change: v => {

	}},
	{id: 'grid', label: 'Grid', title: 'Grid', type: 'checkbox', value: true, change: v => {

	}},
	{id: 'palette', label: 'Colors', type: 'select', value: 'grays', options: ['grays'], change: v => {

	}},
	{id: 'decibels', label: 'Db', type: 'interval', min: -100, max: 0, value: [-90, -30]},
	{id: 'width', label: 'Width', type: 'range', min: 2, max: 40000, precision: 0, log: true, value: 1000, change: v => {
		waveform.width = v;
	}, style: `width: 12em;`},
	// {id: 'offset', label: 'Offset', type: 'range', min: -100, max: 100, precision: 0, value: 0, change: v => {waveform.offset = v;}},
], {
	title: '<a href="https://github.com/audio-lab/gl-waveform">gl-waveform</a>',
	theme: require('../settings-panel/theme/flat'),
	fontSize: 12,
	css: `
		:host {
			z-index: 1;
			position: absolute;
			bottom: 0;
			right: 0;
			left: 0;
			width: 100%;
			background-color: transparent;
			background-image: linear-gradient(to top, rgba(255,255,255, .9) 0%, rgba(255,255,255,0) 120%);
		}
		.settings-panel-title {
			width: auto;
			display: inline-block;
			line-height: 1;
			margin-right: 3em;
			vertical-align: top;
		}
		.settings-panel-field {
			width: auto;
			vertical-align: top;
			display: inline-block;
			margin-right: 1em;
		}
		.settings-panel-label {
			width: auto!important;
		}
	`
});


let waveform = createWaveform({
	offset: null
});

let start = Date.now();
let f = 440;
let t = 0;
setInterval(function pushData () {
	waveform.push(Math.sin(t));
	t += 1/10;
}, 10);