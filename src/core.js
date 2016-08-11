/**
 * @module  gl-waveform
 */

const extend = require('just-extend');
const inherits = require('inherits');
const Component = require('gl-component');
const Grid = require('plot-grid');


module.exports = Waveform;


inherits(Waveform, Component);

/**
 * @constructor
 */
function Waveform (options) {
	if (!(this instanceof Waveform)) return new Waveform(options);

	Component.call(this, options);

	this.init();

	//preset initial freqs
	this.push(this.samples);

	//init style props
	this.update();
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

//offset within samples, null means to the end
Waveform.prototype.offset = null;
Waveform.prototype.width = 1024;

//options for grid
Waveform.prototype.grid = {
};
Waveform.prototype.log = false;

Waveform.prototype.palette = ['black', 'white'];

//main data
Waveform.prototype.samples = [];

//push a new data to the cache
Waveform.prototype.push = function (data) {
	if (!data) return this;
	if (typeof data === 'number') {
		this.samples.push(data);
		return this;
	}

	this.samples = Array.prototype.concat.call(this.samples, data);

	return this;
};

//rewrite samples with a new data
Waveform.prototype.set = function (data) {

};


//init routine
Waveform.prototype.init = () => {};

//update view with new options
Waveform.prototype.update = function update (opts) {
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

	ctx.strokeStyle = 'black'
	ctx.stroke();
	ctx.closePath();

	return this;
};

//TODO: think on adding preview block
