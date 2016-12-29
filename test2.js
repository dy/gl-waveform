/**
 * 2-instance transparent data
 */
const createWaveform = require('./gl')

let N = 1024;
let rate = 44100;
function data (f, phase) {
	if (!f) f = 440;
	if (!phase) phase = 0;
	let arr = new Array(N);
	for (let i = 0; i < N; i++) {
		arr[i] = Math.sin(Math.PI * 2 * f * (i/rate) + phase)
	}
	return arr;
}

let wf1 = createWaveform({
	palette: 'rgb(0, 150, 255)',
	// autostart: false,
	// alpha: true,
	// preserveDrawingBuffer: true
})
wf1.push(data())

wf1.on('draw', () => {
	wf2.draw();
})


let wf2 = createWaveform({
	context: wf1.context,
	palette: 'rgb(255, 150, 0)',
	autostart: false,
	alpha: true,
	preserveDrawingBuffer: true
})
wf2.push(data(440, 1.2))
