/**
 * @module  gl-waveform
 */

const extend = require('just-extend');
const inherits = require('inherits');
const Component = require('gl-component');
const Grid = require('../../plot-grid');
const lerp = require('interpolation-arrays');


module.exports = Waveform;


inherits(Waveform, Component);

/**
 * @constructor
 */
function Waveform (options) {
	if (!(this instanceof Waveform)) return new Waveform(options);

	Component.call(this, options);

	this.init();

	//init style props
	this.update();

	//preset initial freqs
	this.push(this.samples);

	this.on('resize', () => {
		this.update();
	});
}


// Waveform.prototype.context = {
// 	antialias: false,
// 	premultipliedAlpha: true,
// 	alpha: true
// };
Waveform.prototype.context = '2d';

Waveform.prototype.float = false;

Waveform.prototype.maxDecibels = -30;
Waveform.prototype.minDecibels = -90;
Waveform.prototype.sampleRate = 44100;

//offset within samples, null means to the end
Waveform.prototype.offset = null;
Waveform.prototype.width = 1024;

//disable overrendering
Waveform.prototype.autostart = false;

//options for grid
Waveform.prototype.grid = {
};
Waveform.prototype.log = false;

//default palette to draw lines in
Waveform.prototype.palette = [[0,0,0], [255,255,255]];

//main data
Waveform.prototype.samples = [];

//push a new data to the cache
Waveform.prototype.push = function (data) {
	if (!data) return this;
	if (typeof data === 'number') {
		this.samples.push(data);
	}

	else {
		this.samples = Array.prototype.concat.call(this.samples, data);
	}

	this.render();

	return this;
};

//rewrite samples with a new data
Waveform.prototype.set = function (data) {
	if (!data) return this;
	this.samples = data;
};


//init routine
Waveform.prototype.init = function init () {
	//create grids
	// this.timeGrid = new Grid({
	// 	container: this.container,
	// 	lines: [
	// 		{
	// 			orientation: 'x',
	// 			min: 0,
	// 			max: this.width / this.sampleRate,
	// 			units: 's'
	// 		}
	// 	],
	// 	axes: [true],
	// 	viewport: () => this.viewport
	// });

	//paint grid
	this.topGrid = new Grid({
		container: this.container,
		lines: [
			{
				orientation: 'y',
				logarithmic: this.log,
				min: this.minDecibels,
				max: this.maxDecibels
			}
		],
		axes: [true],
		viewport: () => [this.viewport[0] + 40, this.viewport[1], this.viewport[2], this.viewport[3]/2]
	});
	this.bottomGrid = new Grid({
		container: this.container,
		lines: [
			{
				orientation: 'y',
				logarithmic: this.log,
				max: this.minDecibels,
				min: this.maxDecibels
			}
		],
		axes: [true],
		viewport: () => [this.viewport[0] + 40, this.viewport[1] + this.viewport[3]/2, this.viewport[2], this.viewport[3]/2]
	});
};

//update view with new options
Waveform.prototype.update = function update (opts) {
	extend(this, opts);

	//generate palette functino
	let pick = lerp(this.palette);
	this.getColor = v => `rgb(${pick(v).map(v=>v.toFixed(0)).join(',')})`;

	this.canvas.style.backgroundColor = this.getColor(1);
	// this.timeGrid.update();

	if (this.grid) {
		this.topGrid.element.removeAttribute('hidden');
		this.bottomGrid.element.removeAttribute('hidden');
		this.topGrid.update({
			lines: [
				{
					min: this.minDecibels,
					max: this.maxDecibels
				}
			]
		});
		this.bottomGrid.update({
			lines: [
				{
					max: this.minDecibels,
					min: this.maxDecibels
				}
			]
		});
	}
	else {
		this.topGrid.element.setAttribute('hidden', true);
		this.bottomGrid.element.setAttribute('hidden', true);
	}

	return this;
};


//draw routine
//FIXME: move to 2d
Waveform.prototype.draw = function draw () {
	let ctx = this.context;

	let width = this.viewport[2];
	let height = this.viewport[3];

	let padding = 5;

	ctx.clearRect(this.viewport[0], this.viewport[1], width, height);

	//create line path
	ctx.beginPath();
	this.width = Math.floor(this.width);

	let start = this.offset == null ? -this.width : this.offset;
	if (start < 0) {
		start = this.samples.length + start;
	}
	start = Math.max(start, 0);

	//for negative offset shift time
	// if (this.offset < 0 || this.offset == null) {
	// 	this.timeGrid.update({
	// 		lines: [
	// 			{
	// 				min: start / this.sampleRate,
	// 				max: (start + this.width) / this.sampleRate
	// 			}
	// 		]
	// 	});
	// }

	let amp = this.samples[start];
	ctx.moveTo(-padding, (height*.5 - amp*height*.5 ));

	//FIXME: for widths more than vp we should group line by min/max sample
	for (var i = 0; i < this.width; i++) {
		amp = this.samples[i + start];
		let x = ( i / (this.width-1) ) * width;

		ctx.lineTo(x, (height*.5 - amp*height*.5 ));
	}
	amp = this.samples[start+this.width];
	ctx.lineTo(width + padding, (height*.5 - amp*height*.5 ));

	ctx.strokeStyle = this.getColor(0);
	ctx.stroke();
	ctx.closePath();

	//draw central line with active color
	ctx.fillStyle = this.active || this.getColor(.5);
	ctx.fillRect(0, height*.5, width, 1);

	return this;
};

//TODO: think on adding preview block
