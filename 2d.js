/**
 * @module gl-waveform/2d
 *
 * Lightweight waveform renderer
 */
const Waveform = require('./src/core');


module.exports = Waveform;


function Waveform (opts) {

}

Waveform.prototype.container = document.body || document.documentElement;
Waveform.prototype.samples = [];
Waveform.prototype.width = 1024;