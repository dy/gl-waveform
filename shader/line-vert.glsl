// direct sample output, connected by line, to the contrary to range

precision highp float;

#pragma glslify: deamp = require('./deamp.glsl')
#pragma glslify: Samples = require('./samples.glsl')

attribute float id, sign, side;

uniform Samples samples;
uniform sampler2D samplesData;
uniform float opacity, thickness, pxStep, sampleStep, total, translate, posShift;
uniform vec4 viewport, color;
uniform vec2 amplitude, range;
uniform float passNum, passId, passOffset;

varying vec4 fragColor;
varying vec3 statsLeft, statsRight, statsPrevRight, statsNextLeft;
varying float normThickness;

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
		sample = texture2D(samplesData, uv);
	}

	return sample;
}

void main () {
	gl_PointSize = 4.5;
	if (color.a == 0.) return;

	fragColor = color / 255.;
	fragColor.a *= opacity;

	normThickness = thickness / viewport.w;

	float offset = id * sampleStep;

	// calc average of curr..next sampling points
	vec4 sampleCurr = stats(offset);
	if (isNaN(sampleCurr)) return;

	vec4 sampleNext = stats(offset + sampleStep);
	vec4 sampleNext2 = stats(offset + 2. * sampleStep);
	vec4 samplePrev = stats(offset - sampleStep);
	vec4 samplePrev2 = stats(offset - 2. * sampleStep);

	bool isStart = isNaN(samplePrev);
	bool isEnd = isNaN(sampleNext);

	float avgCurr = deamp(sampleCurr.x, amplitude);
	float avgNext = deamp(isEnd ? sampleCurr.x : sampleNext.x, amplitude);
	float avgNext2 = deamp(sampleNext2.x, amplitude);
	float avgPrev = deamp(isStart ? sampleCurr.x : samplePrev.x, amplitude);
	float avgPrev2 = deamp(samplePrev2.x, amplitude);

	// fake sdev 2σ = thickness
	// sdev = normThickness / 2.;
	float sdev = 0.;


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
	vec3 statsCurr = vec3(avgCurr, 0, sampleCurr.z);
	vec3 statsPrev = vec3(avgPrev, 0, samplePrev.z);
	vec3 statsNext = vec3(avgNext, 0, sampleNext.z);
	vec3 statsNext2 = vec3(avgNext2, 0, sampleNext2.z);
	vec3 statsPrev2 = vec3(avgPrev2, 0, samplePrev2.z);

	statsRight = side < 0. ? statsCurr : statsNext;
	statsLeft = side < 0. ? statsPrev : statsCurr;
	statsPrevRight = side < 0. ? statsPrev2 : statsPrev;
	statsNextLeft = side < 0. ? statsNext : statsNext2;

	position += sign * join * .5 * thickness / viewport.zw;

	// compensate snapped sampleStep to enable smooth zoom
	position.x += posShift / viewport.z;

	// shift position by the clip offset
	// FIXME: move to uniform
	position.x += passId * pxStep * samples.length / sampleStep / viewport.z;

	gl_Position = vec4(position * 2. - 1., 0, 1);
}
