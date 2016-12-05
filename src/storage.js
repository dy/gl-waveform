/**
 * @module  gl-waveform/src/storage
 *
 * Storage for the waveform data.
 * Reasonably it is the only proper way to store data for waveform renderer.
 * - it may work in webworker freeing main thread
 * - it caches multiscale min/max data
 */
'use strict';

const clamp = require('mumath/clamp')
const fromDb = require('decibels/to-gain')
const toDb = require('decibels/from-gain')
const Scales = require('multiscale-array')
const bits = require('bit-twiddle')
const nidx = require('negative-index')
const isInt = require('is-integer')
const extend = require('object-assign')
// const colorSpectrum = require('color-spectrum');
// const ft = require('fourier-transform');


module.exports = createStorage;

function createStorage (opts) {
	opts = opts || {};

	//max size of the buffer
	let bufferSize = opts.bufferSize || Math.pow(2, 16)*60;

	//pointer to the last sample (relative) and absolute number of items
	let last = 0, count = 0;

	//samples and samples squared holder
	let xBuffer = Array(bufferSize);
	let x2Buffer = Array(bufferSize);

	//disregard scales more than 8192 items
	let maxScale = opts.maxScale || Math.pow(2, 13);

	let mins = Scales(xBuffer, {
		reduce: (a, b) => Math.min(a, b),
		maxScale: maxScale
	});
	let maxes = Scales(xBuffer, {
		reduce: (a, b) => Math.max(a, b),
		maxScale: maxScale
	});
	let averages = Scales(xBuffer, {
		reduce: (a, b) => a*.5 + b*.5,
		maxScale: maxScale
	});
	let averagesOfSquares = Scales(x2Buffer, {
		reduce: (a, b) => a*.5 + b*.5,
		maxScale: maxScale
	});

	//inner state
	let params = {
		scale: 1,
		offset: 0,
		number: 0,
		log: false,
		minDb: -100,
		maxDb: 0
	}

	//spectrum colors for each 512-samples step
	// let spectrums = [];
	// let fftSize = opts.fftSize || 1024;

	return {
		push: push,
		set: set,
		get: get,
		update: update
	};


	function update (opts, cb) {
		extend(params, opts);

		return get(params, cb);
	}

	function push (chunk, cb) {
		if (!chunk) return;

		if (typeof chunk === 'number') chunk = [chunk];

		//put new samples, update their scales
		for (let i = 0; i < chunk.length; i++) {
			xBuffer[(last + i) % bufferSize] = chunk[i];
			x2Buffer[(last + i) % bufferSize] = chunk[i]*chunk[i];
		}

		let prev = last;

		//rotate last pointer
		count += chunk.length;
		last = count % bufferSize;

		//defer recalc, saves ~0.2ms
		mins.update(prev, prev + chunk.length);
		maxes.update(prev, prev + chunk.length);
		averages.update(prev, prev + chunk.length);
		averagesOfSquares.update(prev, prev + chunk.length);

		//last starts rotating to the beginning
		if (last - chunk.length < 0) {
			mins.update(0, last);
			maxes.update(0, last);
			averages.update(0, last);
			averagesOfSquares.update(0, last);
		}

		return get(params, cb);


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

	function get (opts, cb) {
		if (opts) extend(params, opts);

		let {scale, offset, number, log, minDb, maxDb} = params;

		if (offset==null || number==null) throw Error('offset and number arguments should be passed');

		//do not render not existing data
		let maxNumber = Math.floor(number);
		maxNumber = Math.min(maxNumber, Math.floor(count/scale));
		maxNumber = Math.min(maxNumber, Math.floor(bufferSize/scale));

		let isNegativeOffset = offset < 0;

		if (isNegativeOffset) {
			offset = Math.max(offset, -Math.floor(maxNumber*scale));
		}
		offset = nidx(offset, count);

		//if offset is ahead of known data
		if (offset > count) {
			let data = {min: [], max: [], average: [], variance: [], count: count};
			cb && cb(null, data);
			return data;
		}

		let srcScale = Math.min(bits.nextPow2(Math.ceil(scale)), maxScale);
		let srcIdx = bits.log2(srcScale);
		let srcMins = mins[srcIdx],
			srcMaxes = maxes[srcIdx],
			srcAvgs = averages[srcIdx],
			srcAvgs2 = averagesOfSquares[srcIdx];

		//round to the closest scale block
		if (isNegativeOffset) {
			//hack to avoid wiggling
			let shift = 0;
			if (number*scale < count) {
				let srcNum = Math.floor(count/srcScale)*srcScale;
				let resNum = Math.floor(count/scale)*scale;
				shift = srcNum - resNum;
			}
			offset = Math.floor(offset/srcScale)*srcScale - shift;
		}

		//if offset is far from the ready data
		let data = {
			min: Array(maxNumber),
			max: Array(maxNumber),
			average: Array(maxNumber),
			variance: Array(maxNumber),
			count: count
		};

		let lastVariance = 0, smoothness = .9;
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
			let avg = srcAvgs[lIdx] * (1 - t) + srcAvgs[rIdx] * (t);
			let variance = Math.abs(srcAvgs2[lIdx] - srcAvgs[lIdx]*srcAvgs[lIdx]) * (1 - t) + Math.abs(srcAvgs2[rIdx] - srcAvgs[rIdx]*srcAvgs[rIdx]) * (t);
			variance = variance * (1 - smoothness) + lastVariance * smoothness;
			lastVariance = variance;

			//TODO: move db scaling to vertex shader
			min = f(min, log, minDb, maxDb);
			max = f(max, log, minDb, maxDb);
			avg = f(avg, log, minDb, maxDb);

			data.max[i] = max;
			data.min[i] = min;
			data.average[i] = avg;
			data.variance[i] = variance;
		}

		cb && cb(null, data);

		return data;
	}

	return emitter;
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
