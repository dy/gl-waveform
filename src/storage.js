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


module.exports = createStorage;

function createStorage (opts) {
	let buffer = [];
	let last = 0;
	let allocBlockSize = Math.pow(2, 16);
	let maxScale = Math.pow(2, 16);
	let mins = Scales(buffer, {
		reduce: Math.min,
		maxScale: maxScale
	});
	let maxes = Scales(buffer, {
		reduce: Math.max,
		maxScale: maxScale
	});

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

	function get (scale, from, to, cb) {
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

		let scaleFrom = Math.floor(from / scale);
		let scaleTo = Math.ceil(to / scale);
		let scaleIdx = bits.log2(scale);

		//pow2 case
		if (bits.isPow2(scale) && mins[scaleIdx]) {
			let data = [
				maxes[scaleIdx].slice(scaleFrom, scaleTo),
				mins[scaleIdx].slice(scaleFrom, scaleTo)
			];
			cb && cb(null, data);
			return;
		}


		//for nonpow2 case - interpolate data
		// let srcScale = Math.min(bits.prevPow2(scale), maxScale);
		// let srcIdx = bits.log2(srcScale);
		// let resMins = [], resMaxes = [];

		// for (let i = 0; i < mins[srcIdx].length; i++) {

		// }
		// let idx = ( mins.length - 1 ) * t,
		// 	lIdx = Math.floor( idx ),
		// 	rIdx = Math.ceil( idx );

		// t = idx - lIdx;
	}

	return emitter;
}


/**
 *
 * @param {Array} samples Amplitudes data
 * @param {Object} opts How to render data: should contain width, number, offset, log, min, max
 *
 * @return {Array(width|width*2)} Amplitudes for straight curve or tops/bottoms curves joined into single array
 */
function render (samples, opts) {
	let {width, number, offset, log, min, max, outline} = opts;

	number = Math.floor(number);

	let start = offset == null ? -number : offset;
	if (start < 0) {
		start = samples.length + start;
	}
	start = Math.max(start, 0);

	let data, amp, x;

	//collect tops/bottoms first
	let tops = Array(width), bottoms = Array(width);
	let maxTop, maxBottom, sum, count;
	for (let x = .5, idx = 0; x < width; x++, idx++) {
		let i = number * x / width;

		let lx = Math.floor(x);
		let rx = Math.ceil(x);
		let li = number * lx / width;
		let ri = number * rx / width;

		// ignore out of range data
		if (Math.ceil(ri) + start >= samples.length) {
			break;
		}

		maxTop = -1;
		maxBottom = 1;
		count = 0;

		for (let i = Math.max(Math.floor(li), 0); i < ri; i++) {
			amp = f(samples[i + start], log, min, max);

			sum += amp;
			count++;

			maxTop = Math.max(maxTop, amp);
			maxBottom = Math.min(maxBottom, amp);
		}

		if (maxTop === maxBottom) maxBottom -= .002;
		tops[idx] = maxTop;
		bottoms[idx] = maxBottom;
	}

	data = [tops, bottoms];

	return data;
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
