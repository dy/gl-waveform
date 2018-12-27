// direct sample output, connected by line, to the contrary to range

precision highp float;

#pragma glslify: deamp = require('./deamp.glsl')
#pragma glslify: Samples = require('./samples.glsl')

attribute float id, sign, side;

uniform Samples samples;
uniform float opacity, thickness, pxStep, sampleStep, total, translate;
uniform vec4 viewport, color;
uniform vec2 amplitude, range;
uniform float passNum, passId, passOffset;

varying vec4 fragColor;
varying float avgCurr, avgPrev, avgNext, avgMin, avgMax, sdev, normThickness;

bool isNaN (vec4 sample) {
	return sample.w == -1.;
}

vec4 stats (float offset) {
	// translate is here in order to remove float32 error (at the latest stage)
	offset += translate;

	vec2 uv = vec2(
		floor(mod(offset, samples.shape.x)) + .5,
		floor((offset) / samples.shape.x) + .5
	) / samples.shape;

	vec4 sample;

	// prev texture
	if (uv.y < 0.) {
		uv.y += 1.;
		sample = texture2D(samples.prev, uv);
	}
	// next texture
	else if (uv.y > 1.) {
		uv.y -= 1.;
		sample = texture2D(samples.next, uv);
	}
	// curr texture
	else {
		sample = texture2D(samples.data, uv);
	}

	return sample;
}

void main () {
	gl_PointSize = 4.5;

	normThickness = thickness / viewport.w;
	fragColor = color / 255.;
	fragColor.a *= opacity;

	float offset = id * sampleStep;

	// calc average of curr..next sampling points
	vec4 sampleCurr = stats(offset);
	vec4 sampleNext = stats(offset + sampleStep);
	vec4 samplePrev = stats(offset - sampleStep);

	bool isStart = isNaN(samplePrev);
	bool isEnd = isNaN(sampleNext);

	if (isNaN(sampleCurr)) return;

	avgCurr = deamp(sampleCurr.x, amplitude);
	avgNext = deamp(isEnd ? sampleCurr.x : sampleNext.x, amplitude);
	avgPrev = deamp(isStart ? sampleCurr.x : samplePrev.x, amplitude);

	// fake sdev 2σ = thickness
	// sdev = normThickness / 2.;
	sdev = 0.;

	// compensate snapping for low scale levels
	float posShift = 0.;//id + (translater - offset - translate) / sampleStep;

	vec2 position = vec2(
		pxStep * (id + .5) / (viewport.z),
		avgCurr
	);

	float x = (pxStep) / viewport.z;
	vec2 normalLeft = normalize(vec2(
		-(avgCurr - avgPrev), x
	) / viewport.zw);
	vec2 normalRight = normalize(vec2(
		-(avgNext - avgCurr), x
	) / viewport.zw);

	vec2 join;
	if (isStart || isStart) {
		join = normalRight;
	}
	else if (isEnd || isEnd) {
		join = normalLeft;
	}
	else {
		vec2 bisec = normalLeft * .5 + normalRight * .5;
		float bisecLen = abs(1. / dot(normalLeft, bisec));
		join = bisec * bisecLen;
	}

	// FIXME: limit join by prev vertical
	// float maxJoinX = min(abs(join.x * thickness), 40.) / thickness;
	// join.x *= maxJoinX / join.x;

	// figure out closest to current min/max
	avgMin = min(avgCurr, side < 0. ? avgPrev : avgNext);
	avgMax = max(avgCurr, side < 0. ? avgPrev : avgNext);

	position += sign * join * .5 * thickness / viewport.zw;

	// shift position by the clip offset
	// FIXME: move to uniform
	position.x += passId * pxStep * samples.length / sampleStep / viewport.z;

	gl_Position = vec4(position * 2. - 1., 0, 1);
}
