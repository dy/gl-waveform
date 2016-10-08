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

function createStorage () {
	let buffer = [];
	let last = 0;
	let allocBlockSize = Math.pow(2, 16);
	let maxScale = Math.pow(2, 13);
	let mins = Scales(buffer, {
		reduce: Math.min,
		maxScale: maxScale
	});
	let maxes = Scales(buffer, {
		reduce: Math.max,
		maxScale: maxScale
	});

	//spectrum colors for each 512-samples step
	let spectrums = [];
	let fftSize = 1024;

	return {
		push: push,
		set: set,
		get: get
	}

	function push (chunk, cb) {
		if (!chunk) return;

		if (typeof chunk === 'number') chunk = [chunk];

		if (buffer.length < chunk.length + last) buffer.length = chunk.length + last;

		//put new samples
		for (let i = 0; i < chunk.length; i++) {
			buffer[last + i] = chunk[i];
		}

		last += chunk.length;

		mins.update(last - chunk.length, last);
		maxes.update(last - chunk.length, last);

		//calc spectrums if any
		let spectrumsLen = Math.floor(last / fftSize);
		if (spectrums.length < spectrumsLen) {
			let start = spectrums.length;
			spectrums.length = spectrumsLen;
			for (let i = start; i < spectrumsLen; i++) {
				let spectrum = ft(mins[0].slice(i * fftSize, (i + 1) * fftSize));
				spectrums[i] = spectrum;
			}
		}

		cb && setTimeout(cb);

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

	function get ({scale, from, to, log}, cb) {
		//sort out args
		if (to instanceof Function) {
			cb = to;
			to = mins[0].length;
		}
		if (from instanceof Function) {
			cb = from;
			to = mins[0].length;
			from = 0;
		}
		if (!from) from = 0;
		if (!to) to = mins[0].length;

		from = nidx(from, mins[0].length);
		to = nidx(to, mins[0].length);

		let potScale = Math.min(bits.nextPow2(Math.ceil(scale)), maxScale);

		let scaleFrom = Math.floor(from / potScale);
		let scaleTo = Math.ceil(to / potScale);
		let scaleIdx = bits.log2(potScale);

		let rangeMins = mins[scaleIdx].slice(scaleFrom, scaleTo),
			rangeMaxes = maxes[scaleIdx].slice(scaleFrom, scaleTo);

		let data;

		//po2 case
		if (potScale === scale) {
			data = [rangeMaxes, rangeMins];
		}

		//for nonpot case - interpolate data
		else {
			let len = Math.ceil(rangeMins.length * potScale / scale);
			data = [Array(len), Array(len)];

			for (let i = 0; i < len; i++) {
				let t = i / (len - 1);
				let idx = ( rangeMins.length - 1 ) * t,
					lIdx = Math.floor( idx ),
					rIdx = Math.ceil( idx );

				t = idx - lIdx;

				let min = rangeMaxes[lIdx] * (1 - t) + rangeMaxes[rIdx] * (t);
				let max = rangeMins[lIdx] * (1 - t) + rangeMins[rIdx] * (t);

				data[0][i] = min;
				data[1][i] = max;
			}

		}

		//generate spectrum colors
		// let rangeSpectrums = spectrums.slice(Math.floor(from/fftSize), Math.floor(to/fftSize));
		// let rangeColors = rangeSpectrums.map(spectrum => {
		// 	return colorSpectrum(spectrum)
		// });
		// data.push(rangeColors);

		cb && setTimeout(() => cb(null, data));

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
