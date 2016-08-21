/**
 * @module  gl-waveform
 */
'use strict';

const extend = require('just-extend');
const inherits = require('inherits');
const Component = require('gl-component');
const Grid = require('plot-grid');
const Interpolate = require('color-interpolate');
const fromDb = require('decibels/to-gain');
const toDb = require('decibels/from-gain');
const getData = require('./render');

let isWorkerAvailable = window.Worker;
let workify, worker;
if (isWorkerAvailable) {
	workify = require('webworkify');
	worker = require('./worker');
}

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
	this.set(this.samples);

	this.on('resize', () => {
		this.update();
	});
}


//fill or stroke waveform
Waveform.prototype.fill = true;

//render in log fashion
Waveform.prototype.log = true;

//display db units instead of amplitude, for grid axis
Waveform.prototype.db = true;

//force painting/disabling outline mode - undefined, to detect automatically
Waveform.prototype.outline;

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

//visible window width
Waveform.prototype.width = 1024;


//FIXME: make more generic
Waveform.prototype.context = '2d';
Waveform.prototype.float = false;

//disable overrendering
Waveform.prototype.autostart = false;

//process data in worker
Waveform.prototype.worker = true;


//init routine
Waveform.prototype.init = function init () {
	let that = this;

	//init worker - on messages from worker we plan rerender
	if (this.worker) {
		this.worker = workify(worker);
		this.worker.addEventListener('message', (e) => {
			this.render(e.data);
		});
	}
	else {
		this.samples = [];
	}


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

//push a new data to the cache
Waveform.prototype.push = function (data) {
	if (!data) return this;

	if (typeof data === 'number') data = [data];

	if (this.worker) {
		this.worker.postMessage({
			action: 'push',
			data: data
		});
	}
	else {
		for (let i = 0; i < data.length; i++) {
			this.samples.push(data[i]);
		}

		this.render();
	}

	return this;
};

//rewrite samples with a new data
Waveform.prototype.set = function (data) {
	if (!data) return this;

	if (this.worker) {
		this.worker.postMessage({
			action: 'set',
			data: data
		});
	}
	else {
		this.samples = Array.prototype.slice.call(data);

		this.render();
	}

	return this;
};


//update view with new options
Waveform.prototype.update = function update (opts) {
	extend(this, opts);

	//generate palette functino
	this.getColor = Interpolate(this.palette);

	this.canvas.style.backgroundColor = this.getColor(1);
	this.topGrid.element.style.color = this.getColor(0);
	this.bottomGrid.element.style.color = this.getColor(0);
	// this.timeGrid.update();

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

	//TODO: acquire sampled data (for datasets more that viewport we should store sampled items)

	//render the new properties
	if (!this.worker) {
		this.render();
	} else {
		this.worker.postMessage({
			action: 'update',
			data: this.getRenderOptions()
		})
	}

	return this;
};


//draw routine
//data is amplitudes for curve
//FIXME: move to 2d
Waveform.prototype.draw = function draw (data) {
	//if data length is more than viewport width - we render an outline shape
	let opts = this.getRenderOptions();

	if (!data) {
		//ignore empty worker data
		if (this.worker) return this;

		//get the data, if not explicitly passed
		data = getData(this.samples, opts);
	}

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


	//create line path
	ctx.beginPath();

	let amp = data[0];
	ctx.moveTo(left + .5, top + mid - amp*mid);

	//paint outline, usually for the large dataset
	if (opts.outline) {
		let tops = data[0], bottoms = data[1];
		for (let x = 0; x < tops.length; x++) {
			amp = tops[x];
			ctx.lineTo(x + left, top + mid - amp*mid);
		}
		// ctx.moveTo(left + width - 1, data[width]);
		for (let x = 0; x < bottoms.length; x++) {
			amp = bottoms[bottoms.length - 1 - x];
			ctx.lineTo(left + bottoms.length - 1 - x, top + mid - amp*mid);
		}

		if (!this.fill) {
			ctx.strokeStyle = this.getColor(.5);
			ctx.stroke();
			ctx.closePath();
		}
		else if (this.fill) {
			ctx.closePath();
			ctx.fillStyle = this.getColor(.5);
			ctx.fill();
		}
	}

	//otherwise we render straight line
	else {
		for (let x = 0; x < data.length; x++) {
			amp = data[x];
			ctx.lineTo(x + left, top + mid - amp*mid);
		}

		if (!this.fill) {
			ctx.strokeStyle = this.getColor(.5);
			ctx.stroke();
			ctx.closePath();
		}
		else if (this.fill) {
			ctx.lineTo(data.length + left, top + mid);
			ctx.lineTo(left, top + mid);
			ctx.closePath();
			ctx.fillStyle = this.getColor(.5);
			ctx.fill();
		}
	}

	return this;
};


//just a helper
Waveform.prototype.getRenderOptions = function () {
	return {
		min: this.minDecibels,
		max: this.maxDecibels,
		log: this.log,
		offset: this.offset,
		number: this.width,
		width: this.viewport[2],
		outline: this.outline != null ? this.outline : this.width > this.viewport[2]
	};
}