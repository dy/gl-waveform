// direct sample output, connected by line, to the contrary to range

#pragma glslify: pick = require('./pick.glsl')

precision highp float;

attribute float id, sign;

uniform float opacity, thickness, pxStep, sampleStep, total, translate, dataLength, texShift;
uniform vec4 viewport, color;

varying vec4 fragColor;

void main () {
	gl_PointSize = 1.5;

	fragColor = color / 255.;
	fragColor.a *= opacity;

	// mark adjacent texture with different color
	if (translate + (id) * sampleStep > 64. * 64.) {
		fragColor.x *= .5;
	}

	// float translater = mod(translate, dataLength);
	// if (translater < 0.) translater -= dataLength;
	float offset = floor((id + floor(translate / sampleStep)) * sampleStep + .5);
	// float offset = id * sampleStep + translate;
	// compensate for
	float posShift = sampleStep <= 1. ? id + (translate - offset) / sampleStep : 0.;

	// ignore not existing data
	// if (offset < 0.) return;
	// if (offset > total - 1.) return;

	bool isStart = offset < sampleStep;
	bool isEnd = offset >= total - 1.;
	if (isEnd) fragColor = vec4(0,0,1,1);
	if (isStart) fragColor = vec4(0,0,1,1);

	// calc average of curr..next sampling points
	vec4 sampleCurr = pick(offset, offset - sampleStep);
	vec4 sampleNext = pick(offset + sampleStep, offset - sampleStep);
	vec4 samplePrev = pick(offset - sampleStep, offset - sampleStep);

	vec2 position = vec2(
		pxStep * (id - posShift) / viewport.z,
		sampleCurr.x * .5 + .5
	);

	float x = pxStep / viewport.z;
	vec2 normalLeft = normalize(vec2(
		-(sampleCurr.x - samplePrev.x) * .5, x
	) / viewport.zw);
	vec2 normalRight = normalize(vec2(
		-(sampleNext.x - sampleCurr.x) * .5, x
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
