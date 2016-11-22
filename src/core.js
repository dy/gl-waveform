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
}

//enable pan/zoom
Waveform.prototype.pan = 'drag';
Waveform.prototype.zoom = 'scroll';

//render in log fashion
Waveform.prototype.log = false;

//display db units instead of amplitude, for grid axis
Waveform.prototype.db = true;

//display grid
Waveform.prototype.grid = false;

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

	//samples count
	this.count = 0;


	// function getTitle (v) {
	// 	if (that.log) {
	// 		return that.db ? toDb(v).toFixed(0) : v.toPrecision(2);
	// 	}
	// 	else {
	// 		return that.db ? v : v.toPrecision(1);
	// 	}
	// }

	//create grid
	// this.topGrid = new Grid({
	// 	container: this.container,
	// 	lines: [
	// 		{
	// 			orientation: 'y',
	// 			titles: getTitle
	// 		}
	// 	],
	// 	className: 'grid-top',
	// 	axes: [{
	// 		labels: (value, idx, stats) => {
	// 			if (!this.db && value <= fromDb(this.minDb)) return '0';
	// 			if (parseFloat(stats.titles[idx]) <= this.minDb) return '-∞';
	// 			else return stats.titles[idx];
	// 		}
	// 	}],
	// 	viewport: () => [this.viewport[0], this.viewport[1], this.viewport[2], this.viewport[3]/2]
	// });
	// this.bottomGrid = new Grid({
	// 	container: this.container,
	// 	className: 'grid-bottom',
	// 	lines: [
	// 		{
	// 			orientation: 'y',
	// 			titles: getTitle
	// 		}
	// 	],
	// 	axes: [{
	// 		// hide label
	// 		labels: (value, idx, stats) => {
	// 			if (!this.db && value <= fromDb(this.minDb)) return '';
	// 			if (parseFloat(stats.titles[idx]) <= this.minDb) return '';
	// 			else return stats.titles[idx];
	// 		}
	// 	}],
	// 	viewport: () => [this.viewport[0], this.viewport[1] + this.viewport[3]/2, this.viewport[2], this.viewport[3]/2]
	// });


	//update on resize
	this.on('resize', () => {
		this.update();
	});


	//init pan/zoom
	if (this.pan || this.zoom) {
		//FIXME: make soure that this.count works with count > bufferSize
		panzoom(this.canvas, (e) => {
			this.pan && (e.dx || e.dy) && pan.call(this, Math.floor(e.dx), e.dy, e.x, e.y);
			this.zoom && e.dz && zoom.call(this, e.dz, e.dz, e.x, e.y);
			this.redraw();
		});

		function pan (dx, dy, x, y) {
			if (!this.pan) return;

			let width = this.viewport[2];

			//if drag left from the end - fix offset
			if (dx > 0 && this.offset == null) {
				this.offset = this.count - width*this.scale;
			}

			if (this.offset != null) {
				this.offset -= this.scale*dx;
				this.offset = Math.max(this.offset, 0);
			}

			//if panned to the end - reset offset to null
			if (this.offset + width*this.scale > this.count) {
				this.offset = null;
			}

		}

		function zoom (dx, dy, x, y) {
			if (!this.zoom) return;

			let [left, top, width, height] = this.viewport;

			// if (x==null) x = left + width/2;

			let count = Math.min(this.bufferSize, this.count);

			//shift start
			let cx = x - left;
			let tx = cx/width;

			let prevScale = this.scale;
			let minScale = 2/44100;

			this.scale *= (1 + dy / height);
			this.scale = Math.max(this.scale, minScale);

			if (this.offset == null) {
				//if zoomed in - set specific offset
				if (this.scale < prevScale && tx < .8) {
					this.offset = Math.max(count - width*this.scale, 0);
				}
			}
			else {
				//adjust offset to correspond to the current mouse coord
				this.offset -= width*(this.scale - prevScale)*tx;
				this.offset = Math.max(this.offset, 0);

				//if tail became visible - set offset to null
				if (this.scale > prevScale) {
					if (tx*width*this.scale > count) {
						this.offset = null;
					}
				}

				if (this.offset + width*this.scale > count) {
					this.offset = null;
				}
			}
		}
	}


	//update on new data
	this.on('push', (data, length) => {
		this.redraw();
	});

	this.on('update', opts => {
		this.redraw();
	});

	this.on('set', (data, length) => {
		this.redraw();
	});

	this.on('draw', () => {
		this.isDirty = false;
	});

	this.on('render', () => {
		this.autostart && this.redraw();
	});
};


//push new data to cache
Waveform.prototype.push = function (data, cb) {
	if (!data) return this;

	this.storage.push(data, (err, length) => {
		if (err) throw err;
		this.count = length;
		this.emit('push', data, length);
		cb && cb(length);
	});

	return this;
};

//rewrite samples with a new data
Waveform.prototype.set = function (data, cb) {
	if (!data) return this;

	this.storage.set(data, (err, length) => {
		if (err) throw err;
		this.count = length;
		this.emit('set', data, length);
		cb && cb(length)
	});

	return this;
};


//update view with new options
Waveform.prototype.update = function update (opts) {
	extend(this, opts);

	//generate palette function
	this.getColor = Interpolate(this.palette);

	this.canvas.style.backgroundColor = this.getColor(0);
	// this.topGrid.element.style.color = this.getColor(1);
	// this.bottomGrid.element.style.color = this.getColor(1);

	//grid/lines color
	this.color = this.getColor(1);
	this.infoColor = alpha(this.getColor(.5), .4);

	// this.timeGrid.update();

	this.updateViewport();

	//update grid
	if (this.grid) {
		// this.topGrid.element.removeAttribute('hidden');
		// this.bottomGrid.element.removeAttribute('hidden');
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
			// this.topGrid.update({
			// 	lines: [{
			// 		min: dbMin,
			// 		max: dbMax,
			// 		values: values
			// 	}]
			// });
			// this.bottomGrid.update({
			// 	lines: [{
			// 		max: dbMin,
			// 		min: dbMax,
			// 		values: values
			// 	}]
			// });
		} else {
			// this.topGrid.update({
			// 	lines: [{
			// 		min: this.db ? this.minDb : dbMin,
			// 		max: this.db ? this.maxDb : dbMax,
			// 		values: null
			// 	}]
			// });
			// this.bottomGrid.update({
			// 	lines: [{
			// 		max: this.db ? this.minDb : dbMin,
			// 		min: this.db ? this.maxDb : dbMax,
			// 		values: null
			// 	}]
			// });
		}
	}
	else {
		// this.topGrid.element.setAttribute('hidden', true);
		// this.bottomGrid.element.setAttribute('hidden', true);
	}

	//plan redraw
	this.emit('update', opts);

	return this;
};


//wrapper for draw method to avoid flooding while webworker returns data from storage
Waveform.prototype.redraw = function () {
	if (this.isDirty) {
		return this;
	}

	this.isDirty = true;

	let offset = this.offset;

	if (offset == null) {
		offset = -this.viewport[2] * this.scale;
	}
	this.storage.get({
		scale: this.scale,
		offset: offset,
		number: this.viewport[2],
		log: this.log,
		minDb: this.minDb,
		maxDb: this.maxDb
	}, (err, data) => {
		this.emit('redraw', data);
		this.lastData = data;
		if (!this.autostart) {
			this.clear()
			this.render(data);
		}
	});
}



//data is amplitudes for curve
//FIXME: move to 2d
Waveform.prototype.draw = function () {
	throw Error('Draw method is not implemented in abstract waveform. Use 2d or gl entry.')

	return this;
}
