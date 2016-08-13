/**
 * @module  gl-waveform
 */

const extend = require('just-extend');
const inherits = require('inherits');
const Component = require('gl-component');
const Grid = require('../../plot-grid');
const lerp = require('interpolation-arrays');
var clamp = require('mumath/clamp');
var lg = require('mumath/lg');


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
Waveform.prototype.fill = true;
Waveform.prototype.float = false;

Waveform.prototype.db = true;
Waveform.prototype.maxDecibels = -0;
Waveform.prototype.minDecibels = -50;
Waveform.prototype.sampleRate = 44100;

//offset within samples, null means to the end
Waveform.prototype.offset = null;
Waveform.prototype.width = 1024;

//disable overrendering
Waveform.prototype.autostart = false;

Waveform.prototype.grid = true;
Waveform.prototype.log = true;

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

	let that = this;
	function getTitle (v) {
		if (that.log) {
			return that.db ? toDb(v).toFixed(0) : v.toPrecision(2);
		}
		else {
			return that.db ? v : v.toPrecision(1);
		}
	}

	//paint grid
	this.topGrid = new Grid({
		container: this.container,
		lines: [
			{
				orientation: 'y',
				titles: getTitle
			}
		],
		className: 'grid-top',
		axes: [{
			labels: (value, idx, stats) => {
				if (!this.db && value <= fromDb(this.minDecibels)) return '0';
				if (stats.titles[idx] == this.minDecibels) return '-∞';
				else return stats.titles[idx];
			}
		}],
		viewport: () => [this.viewport[0], this.viewport[1], this.viewport[2], this.viewport[3]/2]
	});
	this.bottomGrid = new Grid({
		container: this.container,
		className: 'grid-bottom',
		lines: [
			{
				orientation: 'y',
				titles: getTitle
			}
		],
		axes: [{
			// hide label
			labels: (value, idx, stats) => {
				if (!this.db && value <= fromDb(this.minDecibels)) return '';
				if (stats.titles[idx] == this.minDecibels) return '';
				else return stats.titles[idx];
			}
		}],
		viewport: () => [this.viewport[0], this.viewport[1] + this.viewport[3]/2, this.viewport[2], this.viewport[3]/2]
	});
};

//update view with new options
Waveform.prototype.update = function update (opts) {
	extend(this, opts);

	//generate palette functino
	let pick = lerp(this.palette);
	this.getColor = v => `rgb(${pick(v).map(v=>v.toFixed(0)).join(',')})`;

	this.canvas.style.backgroundColor = this.getColor(1);
	this.topGrid.element.style.color = this.getColor(0);
	this.bottomGrid.element.style.color = this.getColor(0);
	// this.timeGrid.update();


	if (this.grid) {
		this.topGrid.element.removeAttribute('hidden');
		this.bottomGrid.element.removeAttribute('hidden');
		let dbMin = fromDb(this.minDecibels);
		let dbMax = fromDb(this.maxDecibels);
		if (this.log) {
			let values = [this.minDecibels,
				this.maxDecibels - 10,
				// this.maxDecibels - 9,
				// this.maxDecibels - 8,
				this.maxDecibels - 7,
				this.maxDecibels - 6,
				this.maxDecibels - 5,
				this.maxDecibels - 4,
				this.maxDecibels - 3,
				this.maxDecibels - 2,
				this.maxDecibels - 1,
				this.maxDecibels
			].map(fromDb);
			this.topGrid.update({
				lines: [{
					min: dbMin,
					max: dbMax,
					values: values
				}]
			});
			this.bottomGrid.update({
				lines: [{
					max: dbMin,
					min: dbMax,
					values: values
				}]
			});
		} else {
			this.topGrid.update({
				lines: [{
					min: this.db ? this.minDecibels : dbMin,
					max: this.db ? this.maxDecibels : dbMax,
					values: null
				}]
			});
			this.bottomGrid.update({
				lines: [{
					max: this.db ? this.minDecibels : dbMin,
					min: this.db ? this.maxDecibels : dbMax,
					values: null
				}]
			});
		}
	}
	else {
		this.topGrid.element.setAttribute('hidden', true);
		this.bottomGrid.element.setAttribute('hidden', true);
	}

	this.render();

	return this;
};


//draw routine
//FIXME: move to 2d
Waveform.prototype.draw = function draw () {
	let ctx = this.context;

	let width = this.viewport[2];
	let height = this.viewport[3];
	let left = this.viewport[0];
	let top = this.viewport[1];

	let padding = 1;

	ctx.clearRect(this.viewport[0] - padding, this.viewport[1] - padding, width + padding*2, height + padding*2);

	//draw central line with active color
	ctx.fillStyle = this.active || this.getColor(.5);
	ctx.fillRect(left, top + height*.5, width, .5);

	//ignore empty set
	if (!this.samples.length) return;

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

	let amp = this.f(this.samples[start]);
	ctx.moveTo(-padding + left, top + (height*.5 - amp*height*.5 ));

	//FIXME: for widths more than vp we should group line by min/max sample
	var x;
	for (let i = 0; i < this.width; i++) {
		//ignore out of range data
		if (i + start >= this.samples.length) break;

		amp = this.f(this.samples[i + start]);
		x = ( i / (this.width-1) ) * width;

		ctx.lineTo(x + left, top + (height*.5 - amp*height*.5 ));
	}

	if (!this.fill) {
		ctx.strokeStyle = this.getColor(0);
		ctx.stroke();
		ctx.closePath();
	}
	else if (this.fill) {
		ctx.lineTo(x + left, top + height*.5);
		ctx.lineTo(-padding + left, top + height*.5)
		ctx.fillStyle = this.getColor(.5);
		ctx.fill();
	}

	return this;
};

//TODO: think on adding preview block


Waveform.prototype.f = function (ratio) {
	if (this.log) {
		let db = toDb(Math.abs(ratio));
		db = clamp(db, this.minDecibels, this.maxDecibels);

		let dbRatio = (db - this.minDecibels) / (this.maxDecibels - this.minDecibels);

		ratio = ratio < 0 ? -dbRatio : dbRatio;
	}
	else {
		let min = fromDb(this.minDecibels);
		let max = fromDb(this.maxDecibels);
		let v = clamp(Math.abs(ratio), min, max);

		v = (v - min) / (max - min);
		ratio = ratio < 0 ? -v : v;
	}

	return clamp(ratio, -1, 1);
}


function toDb (p) {
	let p0 = 1;
	return 10*Math.log10(p / p0);
}

function fromDb (db) {
	let p0 = 1;
	return Math.pow(10, db/10) * p0;
}