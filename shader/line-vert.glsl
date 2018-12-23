// direct sample output, connected by line, to the contrary to range

precision highp float;

#pragma glslify: pick = require('./pick.glsl')
#pragma glslify: deamp = require('./deamp.glsl')
#pragma glslify: Samples = require('./samples.glsl')

attribute float id, sign, side;

uniform Samples samples, fractions;
uniform float opacity, thickness, pxStep, sampleStep, total, translate;
uniform vec4 viewport, color;
uniform vec2 amplitude;


varying vec4 fragColor;
varying float avgCurr, avgPrev, avgNext, avgMin, avgMax, sdev, normThickness;

bool isNaN( float val ){
  return ( val < 0.0 || 0.0 < val || val == 0.0 ) ? false : true;
}

void main () {
	gl_PointSize = 4.5;

	normThickness = thickness / viewport.w;

	fragColor = color / 255.;
	fragColor.a *= opacity;

	float offset = id * sampleStep;

	bool isStart = offset <= max(-translate, 0.);
	bool isEnd = offset >= total - translate - 1.;

	// DEBUG: mark adjacent texture with different color
	// if (offset >= 16.) {
	// 	fragColor.x = 1.;
	// }
	if (isEnd) fragColor = vec4(0,0,1,1);
	if (isStart) fragColor = vec4(0,0,1,1);
	if (id == 15.) fragColor = vec4(1,0,0,1);

	// calc average of curr..next sampling points
	vec4 sampleCurr = pick(samples, offset, offset - sampleStep, translate);
	vec4 sampleNext = pick(samples, offset + sampleStep, offset - sampleStep, translate);
	vec4 samplePrev = pick(samples, offset - sampleStep, offset - sampleStep, translate);

	avgCurr = deamp(sampleCurr.x, amplitude);
	avgNext = deamp(isNaN(sampleNext.x) ? sampleCurr.x : sampleNext.x, amplitude);
	avgPrev = deamp(isNaN(samplePrev.x) ? sampleCurr.x : samplePrev.x, amplitude);

	// fake sdev 2σ = thickness
	// sdev = normThickness / 2.;
	sdev = 0.;

	// compensate snapping for low scale levels
	float posShift = 0.;//id + (translater - offset - translate) / sampleStep;

	vec2 position = vec2(
		pxStep * (id - posShift) / viewport.z,
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
	if (isStart || isNaN(samplePrev.x)) {
		join = normalRight;
	}
	else if (isEnd || isNaN(sampleNext.x)) {
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
	gl_Position = vec4(position * 2. - 1., 0, 1);
}
