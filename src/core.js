/**
 * @module  gl-waveform
 */
'use strict';

const extend = require('just-extend')
const inherits = require('inherits')
const Emitter = require('events')
const inter = require('color-interpolate')
const fromDb = require('decibels/to-gain')
const toDb = require('decibels/from-gain')
const createStorage = require('./create-storage')
const alpha = require('color-alpha')
const panzoom = require('pan-zoom')
const rgba = require('color-rgba')
const getContext = require('gl-util/context')
const createLoop = require('canvas-loop')

module.exports = Waveform;


inherits(Waveform, Emitter);


/**
 * @constructor
 */
function Waveform (options) {
	if (!(this instanceof Waveform)) return new Waveform(options);

	Emitter.call(this);

	extend(this, options);

	//create canvas/container
	//FIXME: this is not very good for 2d case though
	if (!this.context) this.context = getContext(this);
	if (!this.canvas) this.canvas = this.context.canvas;
	if (!this.container) this.container = document.body || document.documentElement;
	if (!this.canvas.parentNode) this.container.appendChild(this.canvas);

	//create loop
	this.loop = createLoop(this.canvas, {parent: this.container, scale: this.pixelRatio});
	this.loop.on('tick', () => {
		this.render();
	});
	this.loop.on('resize', () => {
		this.update()
	});


	this.init();
	this.update();

	this.autostart && this.loop.start();
	this.autostart && setTimeout(() => this.render());
}

//enable pan/zoom
Waveform.prototype.pan = 'drag';
Waveform.prototype.zoom = 'scroll';

//render in log fashion
Waveform.prototype.log = false;

//default palette to draw lines in
Waveform.prototype.palette = ['black', 'white'];

//FIXME: mb enable highlight as amplitude/spectrum/etc?
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
Waveform.prototype.autostart = true;

//process data in worker
Waveform.prototype.worker = !!window.Worker;

//canvas property
Waveform.prototype.pixelRatio = window.devicePixelRatio;

//size of the buffer to allocate for the data (1min by default)
Waveform.prototype.bufferSize = 44100 * 20;

//init routine
Waveform.prototype.init = function init () {
	let that = this;

	this.storage = createStorage({worker: this.worker, bufferSize: this.bufferSize});

	this.data = {count: 0, max: [], min: [], average: [], variance: []}

	//init pan/zoom
	if (this.pan || this.zoom) {
		//FIXME: make soure that this.count works with count > bufferSize
		panzoom(this.canvas, (e) => {
			this.pan && (e.dx || e.dy) && pan.call(this, Math.floor(e.dx), e.dy, e.x, e.y);
			this.zoom && e.dz && zoom.call(this, e.dz, e.dz, e.x, e.y);
			this.update();
		});

		function pan (dx, dy, x, y) {
			if (!this.pan) return;

			let width = this.canvas.width;

			//if drag left from the end - fix offset
			if (dx > 0 && this.offset == null) {
				this.offset = this.data.count - width*this.scale;
			}

			if (this.offset != null) {
				this.offset -= this.scale*dx;
				this.offset = Math.max(this.offset, 0);
			}

			//if panned to the end - reset offset to null
			if (this.offset + width*this.scale > this.data.count) {
				this.offset = null;
			}

		}

		function zoom (dx, dy, x, y) {
			if (!this.zoom) return;

			let {width, height} = this.canvas;

			// if (x==null) x = left + width/2;
			let count = Math.min(this.bufferSize, this.data.count);

			//shift start
			let tx = x/width;

			let prevScale = this.scale;
			let minScale = 2/44100;

			this.scale *= (1 + dy / height);
			this.scale = Math.max(this.scale, minScale);

			if (this.offset == null) {
				if (x*this.scale < count && (this.offset + width*this.scale < count)) {
					//if zoomed in - set specific offset
					if (this.scale < prevScale && tx < .8) {
						this.offset = Math.max(count - width*this.scale, 0);
					}
				}
			}
			else {
				this.offset -= width*(this.scale - prevScale)*tx;
				this.offset = Math.max(this.offset, 0);

				//if tail became visible - set offset to null, means all possib data
				if (this.scale > prevScale) {
					//zoom in area more than the data
					if (x*this.scale > count) {
						this.offset = null;
					}
				}

				if (this.offset + width*this.scale > count) {
					this.offset = null;
				}
			}
		}
	}
};


//push new data to cache
Waveform.prototype.push = function (data, cb) {
	if (!data) return this;

	this.storage.push(data, (err, len) => {
		if (err) throw err;
		this.fetch();
		cb && cb(null, resp);
	});
	this.emit('push', data);

	return this;
};

//update view with new options
Waveform.prototype.update = function update (opts, cb) {
	extend(this, opts);

	if (!Array.isArray(this.palette)) {
		this.palette = [this.palette];
	}
	if (this.palette.length === 1) {
		// this.palette = [alpha(this.palette[0], 0), this.palette[0]];
		this.palette = ['rgba(0,0,0,0)', this.palette[0]];
	}

	//generate palette function
	this.getColor = inter(this.palette);

	// this.topGrid.element.style.color = this.getColor(1);
	// this.bottomGrid.element.style.color = this.getColor(1);

	//lines color
	this.color = this.getColor(1);
	this.infoColor = alpha(this.getColor(.5), .4);

	this.background = this.getColor(0);
	// this.timeGrid.update();


	let offset = this.offset;

	if (offset == null) {
		offset = -this.canvas.width * this.scale;
	}

	this.storage.update({
		scale: this.scale,
		offset: offset,
		number: this.canvas.width,
		log: this.log,
		minDb: this.minDb,
		maxDb: this.maxDb
	}, (err, len) => {
		if (err) throw err;
		this.fetch();
		cb && cb(null, resp);
	})

	this.emit('update', opts);

	return this;
};


//fetch latest data from the storage
Waveform.prototype.fetch = function () {
	if (this.isAwait) return;
	this.isAwait = true;
	this.storage.get(null, (err, data) => {
		this.isAwait = false;
		this.data = data;
		this.emit('data', data);
		if (!this.autostart) this.render();
	})
}
