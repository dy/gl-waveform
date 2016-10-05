/**
 * @module  gl-waveform/src/worker-storage
 *
 * Storage using worker using storage, alternative to ./storage.js
 */
'use strict';

const Storage = require('./storage');

let isWorkerAvailable = window.Worker;

let workify, worker;
if (isWorkerAvailable) {
	workify = require('webworkify');
}

module.exports = createStorage;


//webworker version of storage
function createStorage (opts) {
	//single-thread storage
	if (!isWorkerAvailable || (opts && opts.worker === false))  return Storage();

	//worker storage
	let worker = workify(require('./worker'));

	//list of planned callbacks
	let cbs = {
		push: [],
		get: [],
		set: []
	};

	worker.addEventListener('message', function (e) {
		let action = e.data.action;
		let data = e.data.data;
		if (!cbs[action]) throw Error('Unknown action ' + action);
		let cb = cbs[action].shift();
		cb && cb(null, data);
	});

	return {
		push: (data, cb) => {
			cbs.push.push(cb);
			worker.postMessage({action: 'push', args: [data] });
		},
		set: (data, offset, cb) => {
			cbs.set.push(cb);
			worker.postMessage({action: 'set', args: [offset, data] });
		},
		get: (scale, from, to, cb) => {
			cbs.get.push(cb);
			worker.postMessage({action: 'get', args: [scale, from, to] });
		}
	};
}
