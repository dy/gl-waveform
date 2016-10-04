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

	return {
		push: (data, cb) => {
			worker.postMessage({action: 'push', args: [data] });
			cb && worker.addEventListener('message', function pushCb () {
				cb();
				worker.removeEventListener('message', pushCb);
			})
		},
		set: (data, offset, cb) => {
			worker.postMessage({action: 'set', args: [offset, data] });
			cb && worker.addEventListener('message', function setCb () {
				cb();
				worker.removeEventListener('message', setCb);
			})
		},
		get: (scale, from, to, cb) => {
			worker.postMessage({action: 'get', args: [scale, from, to] });
			cb && worker.addEventListener('message', function getCb (data) {
				cb(null, data);
				worker.removeEventListener('message', getCb);
			});
		}
	};
}
