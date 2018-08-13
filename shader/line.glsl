// direct sample output, connected by line, to the contrary to range

#pragma glslify: pick = require('./pick.glsl')

precision highp float;

attribute float id, sign;

uniform float opacity, thickness, pxStep, pxPerSample, sampleStep, total, totals, translate, dataLength, translateri, translater, translatei, translates;
uniform vec2 amp;
uniform vec4 viewport, color;

varying vec4 fragColor;

float reamp(float v) {
	return (v - amp.x) / (amp.y - amp.x);
}

void main () {
	gl_PointSize = 1.5;

	fragColor = color / 255.;
	fragColor.a *= opacity;

	// float id = id - 1.;
	float offset = id * sampleStep + translateri;

	// compensate snapping for low scale levels
	float posShift = pxPerSample < 1. ? 0. : id + (translater - offset) / sampleStep;

	bool isStart = id <= -translates;
	bool isEnd = id >= floor(totals - translates - 1.);

	// DEBUG: mark adjacent texture with different color
	// if (translate + (id) * sampleStep > 64. * 64.) {
	// 	fragColor.x *= .5;
	// }
	// if (isEnd) fragColor = vec4(0,0,1,1);
	// if (isStart) fragColor = vec4(0,0,1,1);

	// calc average of curr..next sampling points
	vec4 sampleCurr = pick(offset, offset - sampleStep);
	vec4 sampleNext = pick(offset + sampleStep, offset - sampleStep);
	vec4 samplePrev = pick(offset - sampleStep, offset - sampleStep);

	sampleCurr.x = reamp(sampleCurr.x);
	sampleNext.x = reamp(sampleNext.x);
	samplePrev.x = reamp(samplePrev.x);

	vec2 position = vec2(
		pxStep * (id - posShift) / viewport.z,
		sampleCurr.x
	);

	float x = pxStep / viewport.z;
	vec2 normalLeft = normalize(vec2(
		-(sampleCurr.x - samplePrev.x), x
	) / viewport.zw);
	vec2 normalRight = normalize(vec2(
		-(sampleNext.x - sampleCurr.x), x
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
