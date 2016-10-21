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
const alpha = require('color-alpha');
const panzoom = require('pan-zoom');


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

	this.on('resize', () => {
		this.update();
	});

	if (this.pan || this.zoom) {
		panzoom(this.canvas, (dx, dy, x, y) => {
			let w = this.viewport[2];
			let t = dx/w;
		}, (dx, dy, x, y) => {
			let [left, top, width, height] = this.viewport;

			if (x==null) x = left + width/2;

			//shift start
			let cx = x - left;
			let t = cx/width;

			let prevScale = this.scale;

			// this.width *= (1 - dy / height);
			// this.width = Math.max(this.width, 1);

			this.scale *= (1 - dy / height);
			this.scale = Math.max(this.scale, .1);

			this.render();
			//TODO
			// this.offset -= (this.width - prevScale) * tx;
		});
	}
}

//enable pan/zoom
Waveform.prototype.pan = true;
Waveform.prototype.zoom = true;

//render in log fashion
Waveform.prototype.log = false;

//display db units instead of amplitude, for grid axis
Waveform.prototype.db = true;

//display grid
Waveform.prototype.grid = true;

//default palette to draw lines in
Waveform.prototype.palette = ['black', 'white'];

//make color reflect spectrum (experimental)
Waveform.prototype.spectrumColor = false;

//amplitude subrange
Waveform.prototype.maxDb = -0;
Waveform.prototype.minDb = -100;

//for time calculation
Waveform.prototype.sampleRate = 44100;

//offset within samples, null means to the end
Waveform.prototype.offset = null;

//scale is how many samples per pixel
Waveform.prototype.scale = 1;

//disable overrendering
Waveform.prototype.autostart = false;

//process data in worker
Waveform.prototype.worker = !!window.Worker;

//size of the buffer to allocate for the data (1min by default)
Waveform.prototype.bufferSize = 44100 * 60;

//init routine
Waveform.prototype.init = function init () {
	let that = this;

	this.storage = createStorage({worker: this.worker, bufferSize: this.bufferSize});

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
				if (!this.db && value <= fromDb(this.minDb)) return '0';
				if (parseFloat(stats.titles[idx]) <= this.minDb) return '-∞';
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
				if (!this.db && value <= fromDb(this.minDb)) return '';
				if (parseFloat(stats.titles[idx]) <= this.minDb) return '';
				else return stats.titles[idx];
			}
		}],
		viewport: () => [this.viewport[0], this.viewport[1] + this.viewport[3]/2, this.viewport[2], this.viewport[3]/2]
	});
};

//push new data to cache
Waveform.prototype.push = function (data) {
	if (!data) return this;

	this.storage.push(data, (err, length) => {
		if (err) throw err;
		this.emit('push', data, length);
	});

	return this;
};

//rewrite samples with a new data
Waveform.prototype.set = function (data) {
	if (!data) return this;

	this.storage.set(data, (err, length) => {
		if (err) throw err;
		this.emit('set', data, length);
	});

	return this;
};


//update view with new options
Waveform.prototype.update = function update (opts) {
	extend(this, opts);

	//generate palette function
	this.getColor = Interpolate(this.palette);

	this.canvas.style.backgroundColor = this.getColor(0);
	this.topGrid.element.style.color = this.getColor(1);
	this.bottomGrid.element.style.color = this.getColor(1);

	//grid/lines color
	this.color = this.getColor(1);
	this.infoColor = alpha(this.getColor(.5), .4);

	// this.timeGrid.update();

	this.updateViewport();

	//update grid
	if (this.grid) {
		this.topGrid.element.removeAttribute('hidden');
		this.bottomGrid.element.removeAttribute('hidden');
		let dbMin = fromDb(this.minDb);
		let dbMax = fromDb(this.maxDb);
		if (this.log) {
			let values = [this.minDb,
				this.maxDb - 10,
				// this.maxDb - 9,
				// this.maxDb - 8,
				this.maxDb - 7,
				this.maxDb - 6,
				this.maxDb - 5,
				this.maxDb - 4,
				this.maxDb - 3,
				this.maxDb - 2,
				this.maxDb - 1,
				this.maxDb
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
					min: this.db ? this.minDb : dbMin,
					max: this.db ? this.maxDb : dbMax,
					values: null
				}]
			});
			this.bottomGrid.update({
				lines: [{
					max: this.db ? this.minDb : dbMin,
					min: this.db ? this.maxDb : dbMax,
					values: null
				}]
			});
		}
	}
	else {
		this.topGrid.element.setAttribute('hidden', true);
		this.bottomGrid.element.setAttribute('hidden', true);
	}

	//plan redraw
	this.emit('update', opts);

	return this;
};


//data is amplitudes for curve
//FIXME: move to 2d
Waveform.prototype.draw = function () {
	throw Error('Draw method is not implemented in abstract waveform. Use 2d or gl entry.')

	return this;
}
