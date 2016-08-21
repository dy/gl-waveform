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
Waveform.prototype.type = 'fill';

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
		this.amplitudes = [];
	}

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

		let skipped = this.samples.length - this.lastLen;
		let opts = this.getRenderOptions();
		if (skipped > opts.samplesPerPixel) {
			let data = getData(this.samples.slice(-skipped), opts);
			for (let i = 0; i < data[0].length; i++) {
				this.amplitudes[0].push(data[0][i]);
				this.amplitudes[1].push(data[1][i]);
			}
			this.amplitudes[0] = this.amplitudes[0].slice(-opts.width);
			this.amplitudes[1] = this.amplitudes[1].slice(-opts.width);
			this.lastLen = this.samples.length;
		}

		this.render(this.amplitudes);
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

		//get the data, if not explicitly passed
		this.amplitudes = getData(this.samples, this.getRenderOptions());

		this.render(this.amplitudes);

		//reset some things for push
		this.lastLen = this.samples.length;
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

	//render the new properties
	if (!this.worker) {
		this.amplitudes = getData(this.samples, this.getRenderOptions());
		this.render(this.amplitudes);
	} else {
		this.worker.postMessage({
			action: 'update',
			data: this.getRenderOptions()
		});
	}

	return this;
};


//draw routine
//data is amplitudes for curve
//FIXME: move to 2d
Waveform.prototype.draw = function draw (data) {
	//if data length is more than viewport width - we render an outline shape
	let opts = this.getRenderOptions();

	if (!data) return this;

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

	if (!data[0]) return;

	//create line path
	ctx.beginPath();

	let amp = data[0];
	ctx.moveTo(left + .5, top + mid - amp*mid);

	//paint outline, usually for the large dataset
	if (opts.outline) {
		let tops = data[0], bottoms = data[1];
		let prev, next, curr;


		//too dense guys cause audio glitch, therefore simplify render
		if (this.width/30 > width) {
			let items = [];
			for (let x = 0; x < tops.length; x++) {
				curr = Math.max(tops[x], -bottoms[x]);
				amp = curr;
				items.push(amp);
				ctx.lineTo(x + left, top + mid - amp*mid);
			}
			for (let x = 0; x < items.length; x++) {
				amp = items[items.length - 1 - x];
				ctx.lineTo(items.length - 1 - x + left, top + mid + amp*mid);
			}

			//dirty hack to avoid
			// ctx.lineTo(left + tops.length, top + mid);
			ctx.lineTo(left, top + mid);
		}
		//if allowable - show more details
		else {
			for (let x = 0; x < tops.length; x++) {
				curr = tops[x];
				amp = curr;
				ctx.lineTo(x + left, top + mid - amp*mid);
			}
			for (let x = 0; x < bottoms.length; x++) {
				curr = bottoms[bottoms.length - 1 - x];
				amp = curr;
				ctx.lineTo(left + bottoms.length - 1 - x, top + mid - amp*mid);
			}
		}


		if (this.type !== 'fill') {
			ctx.strokeStyle = this.getColor(.5);
			ctx.stroke();
			ctx.closePath();
		}
		else if (this.type === 'fill') {
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

		if (this.type !== 'fill') {
			ctx.strokeStyle = this.getColor(.5);
			ctx.stroke();
			ctx.closePath();
		}
		else if (this.type === 'fill') {
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
		samplesPerPixel: this.samplesPerPixel,
		outline: this.outline != null ? this.outline : this.width > this.viewport[2]
	};
}