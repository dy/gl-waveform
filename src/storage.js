/**
 * @module  gl-waveform/src/storage
 *
 * Storage for the waveform data.
 * Reasonably it is the only proper way to store data for waveform renderer.
 * - it may work in webworker freeing main thread
 * - it caches multiscale min/max data
 */
'use strict';

const clamp = require('mumath/clamp');
const fromDb = require('decibels/to-gain');
const toDb = require('decibels/from-gain');
const Scales = require('multiscale-array');
const Emitter = require('events').EventEmitter;
const bits = require('bit-twiddle');
const nidx = require('negative-index');
const isInt = require('is-integer');
const colorSpectrum = require('color-spectrum');
const ft = require('fourier-transform');


module.exports = createStorage;

function createStorage (opts) {
	opts = opts || {};

	//max size of the buffer
	let bufferSize = opts.bufferSize || Math.pow(2, 16)*60;

	//pointer to the last sample (relative) and absolute number of items
	let last = 0, count = 0;

	//samples holder
	let buffer = Array(bufferSize);
	//disregard scales more than 8192 items
	let maxScale = opts.maxScale || Math.pow(2, 13);

	let mins = Scales(buffer, {
		reduce: Math.min,
		maxScale: maxScale
	});
	let maxes = Scales(buffer, {
		reduce: Math.max,
		maxScale: maxScale
	});

	//spectrum colors for each 512-samples step
	// let spectrums = [];
	// let fftSize = opts.fftSize || 1024;

	return {
		push: push,
		set: set,
		get: get
	};

	function push (chunk, cb) {
		if (!chunk) return;

		if (typeof chunk === 'number') chunk = [chunk];

		//put new samples, update their scales
		for (let i = 0; i < chunk.length; i++) {
			buffer[(last + i) % bufferSize] = chunk[i];
		}
		mins.update(last, last + chunk.length);
		maxes.update(last, last + chunk.length);

		//rotate last pointer
		count += chunk.length;
		last = count % bufferSize;

		//last started rotating to the beginning
		if (last - chunk.length < 0) {
			mins.update(0, last);
			maxes.update(0, last);
		}


		//calc spectrums if any
		// let spectrumsLen = Math.floor(last / fftSize);
		// if (spectrums.length < spectrumsLen) {
		// 	let start = spectrums.length;
		// 	spectrums.length = spectrumsLen;
		// 	for (let i = start; i < spectrumsLen; i++) {
		// 		let spectrum = ft(mins[0].slice(i * fftSize, (i + 1) * fftSize));
		// 		spectrums[i] = spectrum;
		// 	}
		// }

		cb && cb(null, count);

		return this;
	}

	function set (data, offset, cb) {
		// this.samples = Array.prototype.slice.call(data);

		// //get the data, if not explicitly passed
		// this.amplitudes = getData(this.samples, this.getRenderOptions());

		// this.render(this.amplitudes);

		// //reset some things for push
		// this.lastLen = this.samples.length;

		// cb && cb(null, [mins, maxes]);

		return this;
	}

	function get ({scale, offset, number, log}, cb) {
		if (offset==null || number==null) throw Error('offset and number arguments should be passed');

		//do not render not existing data
		let maxNumber = number;
		maxNumber = Math.min(maxNumber, Math.floor(count/scale));
		maxNumber = Math.min(maxNumber, Math.floor(bufferSize/scale));

		if (offset < 0) {
			offset = Math.max(offset, -maxNumber*scale);
		}
		offset = nidx(offset, count);

		//if offset is ahead of known data
		if (offset > count) {
			let data = [[], []];
			cb && cb(null, data);
			return data;
		}

		//if offset is far from the ready data
		let data = [Array(maxNumber), Array(maxNumber)];
		let srcScale = Math.min(bits.nextPow2(Math.ceil(scale)), maxScale);
		let srcIdx = bits.log2(srcScale);
		let srcMins = mins[srcIdx], srcMaxes = maxes[srcIdx];

		for (let i = 0; i < maxNumber; i++) {
			let ratio = (i + .5) / (number);
			let dataIdx = (offset + number*scale*ratio) % bufferSize;

			//interpolate value
			let idx = dataIdx / srcScale,
				lIdx = Math.floor( idx ),
				rIdx = Math.ceil( idx );
			let t = idx - lIdx;
			let min = srcMins[lIdx] * (1 - t) + srcMins[rIdx] * (t);
			let max = srcMaxes[lIdx] * (1 - t) + srcMaxes[rIdx] * (t);

			data[0][i] = max;
			data[1][i] = min;
		}

		cb && cb(null, data);
		return data;
	}

	return emitter;
}


function inter (data, idx) {
	let lIdx = Math.floor( idx ),
		rIdx = Math.ceil( idx );

	let t = idx - lIdx;

	let left = data[lIdx], right = data[rIdx];

	return left * (1 - t) + right * t;
}


function f(ratio, log, min, max) {
	if (log) {
		let db = toDb(Math.abs(ratio));
		db = clamp(db, min, max);

		let dbRatio = (db - min) / (max - min);

		ratio = ratio < 0 ? -dbRatio : dbRatio;
	}
	else {
		min = fromDb(min);
		max = fromDb(max);
		let v = clamp(Math.abs(ratio), min, max);

		v = (v - min) / (max - min);
		ratio = ratio < 0 ? -v : v;
	}

	return clamp(ratio, -1, 1);
}
