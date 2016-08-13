const createSettings = require('settings-panel');
const createWaveform = require('./src/core');
const insertCss =  require('insert-styles');
const Color = require('tinycolor2');
const colormap = require('colormap');
const colorScales = require('colormap/colorScales');
let palettes = require('nice-color-palettes/500');


let colormaps = {};

for (var name in colorScales) {
	if (name === 'alpha') continue;
	if (name === 'hsv') continue;
	if (name === 'rainbow') continue;
	if (name === 'rainbow-soft') continue;
	if (name === 'phase') continue;

	colormaps[name] = colormap({
		colormap: colorScales[name],
		nshades: 16,
		format: 'rgbaString'
	});
	palettes.push(colormaps[name]);
}

palettes = palettes
//filter not readable palettes
.filter((palette) => {
	return Color.isReadable(palette[0], palette.slice(-1)[0], {
		level:"AA", size:"large"
	});
});


insertCss(`
	body {
		padding: 0;
		margin: 0;
	}
	.grid .grid-label {
		top: 0;
	}
`);


let settings = createSettings([
	{id: 'fill', label: 'Fill', type: 'checkbox', value: true, change: v => {
		waveform.update({fill: v});
	}},
	{id: 'db', label: 'Db', title: 'Display units in decibels', type: 'checkbox', value: true, change: v => {
		waveform.update({db: v});
	}},
	{id: 'log', label: 'Log', type: 'checkbox', value: true, change: v => {
		waveform.update({log: v});
	}},
	{id: 'grid', label: 'Grid', title: 'Grid', type: 'checkbox', value: true, change: v => {
		waveform.update({grid: v});
	}},
	// {id: 'natural', label: 'Natural', title: 'Dye waveform into a natural color depending on frequency contents', type: 'checkbox', value: true, change: v => {
	// }},
	// {id: 'colors', label: 'Colors', type: 'select', value: 'custom', options: (() => {let opts = Object.keys(colormaps); opts.push('custom'); return opts;})(), change: v => {
	// }},
	// {id: 'offset', label: 'Offset', type: 'range', min: -100, max: 100, precision: 0, value: 0, change: v => {waveform.offset = v;}},
	// {id: 'padding', label: 'Padding', type: 'range', min: 0, max: 100, precision: 0, value: 50, change: v => {
	// 	waveform.padding = v;
	// 	waveform.update();
	// }},
	{type: 'raw', label: false, id: 'palette', style: ``, content: function (data) {
		let el = document.createElement('div');
		el.className = 'random-palette';
		el.style.cssText = `
			width: 1.5em;
			height: 1.5em;
			background-color: rgba(120,120,120,.2);
			margin-left: 0em;
			display: inline-block;
			vertical-align: middle;
			cursor: pointer;
			margin-right: 1em;
		`;
		el.title = 'Randomize palette';
		let settings = this.panel;
		setColors(el, settings.theme.palette, settings.theme.active);

		el.onclick = () => {
			settings.set('colors', 'custom');

			let palette = palettes[Math.floor((palettes.length - 1) * Math.random())];
			let bg = palette[palette.length -1];

			settings.update({
				palette: palette,
				style: `background-image: linear-gradient(to top, ${Color(bg).setAlpha(.9).toString()} 0%, ${Color(bg).setAlpha(0).toString()} 120%);`});

			//FIXME: avoid rgb array palette
			let arrPalette = setColors(el, palette);
			waveform.update({
				palette: arrPalette
			});
		}

		//create colors in the element
		function setColors(el, palette, active) {
			el.innerHTML = '';
			if (active) {
				palette = palette.slice();
				palette.unshift(active);
			}
			for (var i = 0; i < 3; i++) {
				let colorEl = document.createElement('div');
				el.appendChild(colorEl);
				colorEl.className = 'random-palette-color';
				colorEl.style.cssText = `
					width: 50%;
					height: 50%;
					float: left;
					background-color: ${palette[i] || 'transparent'}
				`;
			}

			palette = palette.map(c => {
				let rgb = Color(c).toRgb();
				return [rgb.r, rgb.g, rgb.b];
			});

			return palette;
		}
		return el;
	}},
	{id: 'decibels', label: 'Range', type: 'interval', min: -100, max: 0, value: [-60, -0], change: v => {
		waveform.minDecibels = v[0];
		waveform.maxDecibels = v[1];
		waveform.update();
	}, style: `width: 20em;`},
	{id: 'width', label: 'Width', type: 'range', min: 2, max: 50000, precision: 0, log: true, value: 1000, change: v => {
		waveform.width = v;
	}, style: `width: 12em;`},
], {
	// title: '<a href="https://github.com/audio-lab/gl-waveform">gl-waveform</a>',
	theme: require('settings-panel/theme/flat'),
	fontSize: 12,
	css: `
		:host {
			z-index: 1;
			position: fixed;
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
	offset: null,
	palette: settings.theme.palette.map(v => {
		let rgb = Color(v).toRgb();
		return [rgb.r, rgb.g, rgb.b]
	}),
	active: settings.theme.active,
	padding: 50,
	viewport: function (w, h) { return [this.padding, this.padding, w - this.padding*2, h - this.padding*2] }
});
waveform.topGrid.element.style.fontFamily = settings.theme.fontFamily;
waveform.bottomGrid.element.style.fontFamily = settings.theme.fontFamily;

let start = Date.now();
let f = 440;
let t = 0;
setInterval(function pushData () {
	waveform.push(Math.sin(t));
	t += 1/10;
}, 10);