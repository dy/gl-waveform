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
			worker.addEventListener('message', function pushCb (e) {
				if (e.data.action != 'push') return;
				worker.removeEventListener('message', pushCb);
				cb && cb();
			})
		},
		set: (data, offset, cb) => {
			worker.postMessage({action: 'set', args: [offset, data] });
			worker.addEventListener('message', function setCb () {
				if (e.data.action != 'set') return;
				worker.removeEventListener('message', setCb);
				cb && cb();
			})
		},
		get: (scale, from, to, cb) => {
			worker.postMessage({action: 'get', args: [scale, from, to] });
			worker.addEventListener('message', function getCb (e) {
				if (e.data.action != 'get') return;
				worker.removeEventListener('message', getCb);
				cb && cb(null, e.data.data);
			});
		}
	};
}
