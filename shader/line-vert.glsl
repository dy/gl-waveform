// direct sample output, connected by line, to the contrary to range

precision highp float;

#pragma glslify: pick = require('./pick.glsl')
#pragma glslify: reamp = require('./reamp.glsl')
#pragma glslify: Samples = require('./samples.glsl')

attribute float id, sign;

uniform Samples samples;
uniform float opacity, thickness, pxStep, pxPerSample, sampleStep, total, totals, translate, dataLength, translateri, translater, translatei, translates;
uniform vec4 viewport, color;
uniform vec2 amp;


varying vec4 fragColor;
varying float avgCurr, avgPrev, avgNext, avgMin, avgMax, sdev, normThickness;

bool isNaN( float val ){
  return ( val < 0.0 || 0.0 < val || val == 0.0 ) ? false : true;
}

void main () {
	gl_PointSize = 1.5;

	normThickness = thickness / viewport.w;

	fragColor = color / 255.;
	fragColor.a *= opacity;

	float offset = id * sampleStep;


	bool isStart = id <= -translates;
	bool isEnd = id >= floor(totals - translates - 1.);

	// DEBUG: mark adjacent texture with different color
	// if (translate + (id) * sampleStep > 64. * 64.) {
	// 	fragColor.x *= .5;
	// }
	// if (isEnd) fragColor = vec4(0,0,1,1);
	// if (isStart) fragColor = vec4(0,0,1,1);

	// calc average of curr..next sampling points
	vec4 sampleCurr = pick(samples, offset, offset - sampleStep, translateri);
	vec4 sampleNext = pick(samples, offset + sampleStep, offset - sampleStep, translateri);
	vec4 samplePrev = pick(samples, offset - sampleStep, offset - sampleStep, translateri);

	avgCurr = reamp(sampleCurr.x, amp);
	avgNext = reamp(isNaN(sampleNext.x) ? sampleCurr.x : sampleNext.x, amp);
	avgPrev = reamp(isNaN(samplePrev.x) ? sampleCurr.x : samplePrev.x, amp);

	// since sdev is fully defined by thickness, we fake it to render fade
	// 2σ = thickness
	sdev = normThickness / 2.;

	// compensate snapping for low scale levels
	float posShift = pxPerSample < 1. ? 0. : id + (translater - offset - translateri) / sampleStep;

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

	avgMin = min(min(avgCurr, avgNext), avgPrev);
	avgMax = max(max(avgCurr, avgNext), avgPrev);

	position += sign * join * .5 * thickness / viewport.zw;
	gl_Position = vec4(position * 2. - 1., 0, 1);
}
