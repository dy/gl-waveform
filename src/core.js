/**
 * @module  gl-waveform
 */
'use strict';

const extend = require('just-extend');
const inherits = require('inherits');
const GlComponent = require('gl-component');
const Grid = require('plot-grid');
const Interpolate = require('color-interpolate');
const fromDb = require('decibels/to-gain');
const toDb = require('decibels/from-gain');
const createStorage = require('./create-storage');


module.exports = Waveform;


inherits(Waveform, GlComponent);


/**
 * @constructor
 */
function Waveform (options) {
	if (!(this instanceof Waveform)) return new Waveform(options);

	GlComponent.call(this, options);

	this.init();

	//init style props
	this.update();

	//preset initial freqs
	this.set(this.samples);

	this.on('resize', () => {
		this.update();
	});
}


//render in log fashion
Waveform.prototype.log = true;

//display db units instead of amplitude, for grid axis
Waveform.prototype.db = true;

//display grid
Waveform.prototype.grid = true;

//default palette to draw lines in
Waveform.prototype.palette = ['black', 'white'];

//amplitude subrange
Waveform.prototype.maxDecibels = -0;
Waveform.prototype.minDecibels = -100;

//for time calculation
Waveform.prototype.sampleRate = 44100;

//offset within samples, null means to the end
Waveform.prototype.offset = null;

//scale is how many samples per pixel
Waveform.prototype.scale = 1;


//FIXME: make more generic
Waveform.prototype.context = '2d';
Waveform.prototype.float = false;

//disable overrendering
Waveform.prototype.autostart = false;

//process data in worker
Waveform.prototype.worker = !!window.Worker;


//init routine
Waveform.prototype.init = function init () {
	let that = this;

	this.storage = createStorage({worker: this.worker});

	function getTitle (v) {
		if (that.log) {
			return that.db ? toDb(v).toFixed(0) : v.toPrecision(2);
		}
		else {
			return that.db ? v : v.toPrecision(1);
		}
	}

	//create grid
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
				if (parseFloat(stats.titles[idx]) <= this.minDecibels) return '-∞';
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
				if (parseFloat(stats.titles[idx]) <= this.minDecibels) return '';
				else return stats.titles[idx];
			}
		}],
		viewport: () => [this.viewport[0], this.viewport[1] + this.viewport[3]/2, this.viewport[2], this.viewport[3]/2]
	});
};

//push new data to cache
Waveform.prototype.push = function (data) {
	if (!data) return this;

	this.storage.push(data, (err) => {
		if (err) throw err;
		this.redraw();
	});


	return this;
};

//rewrite samples with a new data
Waveform.prototype.set = function (data) {
	if (!data) return this;

	this.storage.set(data, (err) => {
		this.redraw();
	});

	return this;
};

//plan draw
Waveform.prototype.redraw = function () {
	if (this.isDirty) {
		return this;
	}
	this.isDirty = true;

	let offset = this.offset;

	if (offset == null) {
		offset = -this.viewport[2];
	}

	this.storage.get(this.scale, offset * this.scale, (offset + this.viewport[2])*this.scale, (err, data) => {
		this.render(data);
		this.isDirty = false;
		this.emit('redraw');
	});
}


//update view with new options
//FIXME: move to 2d
Waveform.prototype.update = function update (opts) {
	extend(this, opts);

	//generate palette function
	this.getColor = Interpolate(this.palette);

	this.canvas.style.backgroundColor = this.getColor(1);
	this.topGrid.element.style.color = this.getColor(0);
	this.bottomGrid.element.style.color = this.getColor(0);
	// this.timeGrid.update();

	this.updateViewport();

	//update grid
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

	this.samplesPerPixel = this.width / this.viewport[2];

	//plan redraw
	if (this.isDirty) {
		this.once('redraw', () => {
			this.redraw();
		});
	}
	else {
		this.redraw();
	}

	return this;
};


//data is amplitudes for curve
//FIXME: move to 2d
Waveform.prototype.draw = function draw (data) {
	//clean flag
	if (this.isDirty) this.isDirty = false;

	if (!data) return this;

	let tops = data[0], bottoms = data[1];
	let ctx = this.context;
	let width = this.viewport[2];
	let height = this.viewport[3];
	let left = this.viewport[0];
	let top = this.viewport[1];

	let mid = height*.5;

	ctx.clearRect(this.viewport[0] - 1, this.viewport[1] - 1, width + 2, height + 2);


	//draw central line with active color
	ctx.fillStyle = this.active || this.getColor(0);
	ctx.fillRect(left, top + mid, width, .5);

	if (!tops || !bottoms || !tops.length || !bottoms.length) return this;

	//create line path
	ctx.beginPath();

	let amp = data[0];
	ctx.moveTo(left + .5, top + mid - amp*mid);

	//low scale has 1:1 data
	if (this.scale < 2) {
		for (let x = 0; x < tops.length; x++) {
			amp = tops[x];
			ctx.lineTo(x + left, top + mid - amp*mid);
		}
		ctx.strokeStyle = this.getColor(.5);
		ctx.stroke();
	}
	else {
		for (let x = 0; x < tops.length; x++) {
			amp = tops[x];
			ctx.lineTo(x + left, top + mid - amp*mid);
		}
		for (let x = 0; x < bottoms.length; x++) {
			amp = bottoms[bottoms.length - 1 - x];
			ctx.lineTo(left + bottoms.length - 1 - x, top + mid - amp*mid);
		}
		ctx.fillStyle = this.getColor(.5);
		ctx.fill();
	}

	ctx.closePath();

	return this;
};

