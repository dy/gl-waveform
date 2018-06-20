#pragma glslify: toGain = require('glsl-decibels/to-gain')
#pragma glslify: fromGain = require('glsl-decibels/from-gain')

precision highp float;

attribute float id, ampSign;
//
uniform sampler2D data;
uniform vec2 dataShape;
uniform float minDb, maxDb, logarithmic, thickness, pxStep, opacity;
uniform vec4 viewport;
uniform float count, offset;

varying vec4 fragColor;

float toRange (float value) {
	if (logarithmic > 0.) {
		float db = fromGain(abs(value));
		db = clamp(db, minDb, maxDb);

		float dbRatio = (db - minDb) / (maxDb - minDb);

		value = value < 0. ? -dbRatio : dbRatio;
	}
	else {
		float minGain = toGain(minDb);
		float maxGain = toGain(maxDb);
		float v = clamp(abs(value), minGain, maxGain);

		v = (v - minGain) / (maxGain - minGain);
		value = value < 0. ? -v : v;
	}

	return clamp(value, -1., 1.);
}

vec3 getSample (float id) {
	float dataWidth = dataShape.x - 2.;
	float left = id * pxStep / viewport.z;
	float sampleId = left * count + offset;
	float x = (mod(sampleId, dataWidth) + 1.5) / dataShape.x;
	float y = (floor(sampleId / dataWidth) + .5) / dataShape.y;
	vec4 sample = texture2D(data, vec2(x, y));

	return sample.xyz;
}

void main () {
	float samplesPerStep = count * pxStep / (viewport.z);
	float left = id / viewport.z;

	fragColor = vec4(0,0,0,1);

	float avg, sdev;

	// vec3 leftSample = getSample(id - .5);
	// vec3 rightSample = getSample(id + .5);
	// avg = (rightSample.y - leftSample.y) / samplesPerStep;

	// float samples = 1. / count;
	vec4 leftSample = texture2D(data, vec2( (count / dataShape.x) * ((id - .5) / viewport.z), 0));
	// vec4 rightSample = texture2D(data, vec2( (count / dataShape.x) * ((id + .5) / viewport.z), 0));

	avg = leftSample.x;

	gl_PointSize = 2.;
	gl_Position = vec4( left * 2. - 1., avg + .1 * ampSign, 0, 1);
}
