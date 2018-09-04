// direct sample output, connected by line, to the contrary to range

precision highp float;

#pragma glslify: pick = require('./pick.glsl')
#pragma glslify: reamp = require('./reamp.glsl')


attribute float id, sign;


uniform float opacity, thickness, pxStep, pxPerSample, sampleStep, total, totals, translate, dataLength, translateri, translater, translatei, translates;
uniform vec4 viewport, color;
uniform vec2 amp;


varying vec4 fragColor;
varying float avgPrev, avgCurr, avgNext, sdev;


void main () {
	gl_PointSize = 1.5;

	fragColor = color / 255.;
	fragColor.a *= opacity;

	float offset = id * sampleStep;

	// compensate snapping for low scale levels
	float posShift = pxPerSample < 1. ? 0. : id + (translater - offset - translateri) / sampleStep;

	bool isStart = id <= -translates;
	bool isEnd = id >= floor(totals - translates - 1.);

	// DEBUG: mark adjacent texture with different color
	// if (translate + (id) * sampleStep > 64. * 64.) {
	// 	fragColor.x *= .5;
	// }
	// if (isEnd) fragColor = vec4(0,0,1,1);
	// if (isStart) fragColor = vec4(0,0,1,1);

	// calc average of curr..next sampling points
	vec4 sampleCurr = pick(offset, offset - sampleStep, translateri);
	vec4 sampleNext = pick(offset + sampleStep, offset - sampleStep, translateri);
	vec4 samplePrev = pick(offset - sampleStep, offset - sampleStep, translateri);

	avgCurr = reamp(sampleCurr.x, amp);
	avgNext = reamp(sampleNext.x, amp);
	avgPrev = reamp(samplePrev.x, amp);

	sdev = 0.;

	vec2 position = vec2(
		pxStep * (id - posShift) / viewport.z,
		avgCurr
	);

	float x = pxStep / viewport.z;
	vec2 normalLeft = normalize(vec2(
		-(avgCurr - avgPrev), x
	) / viewport.zw);
	vec2 normalRight = normalize(vec2(
		-(avgNext - avgCurr), x
	) / viewport.zw);

	vec2 join;
	if (isStart) {
		join = normalRight;
	}
	else if (isEnd) {
		join = normalLeft;
	}
	else {
		vec2 bisec = normalize(normalLeft + normalRight);
		float bisecLen = abs(1. / dot(normalLeft, bisec));
		join = bisec * bisecLen;
	}

	// FIXME: limit join by prev vertical
	// float maxJoinX = min(abs(join.x * thickness), 40.) / thickness;
	// join.x *= maxJoinX / join.x;

	position += sign * join * .5 * thickness / viewport.zw;
	gl_Position = vec4(position * 2. - 1., 0, 1);
}
