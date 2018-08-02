// direct sample output, connected by line, to the contrary to range

#pragma glslify: pick = require('./pick.glsl')

precision highp float;

attribute float id, sign;

uniform float opacity, thickness, step, samplesPerStep;
uniform vec2 scale, translate;
uniform vec4 viewport, color;

varying vec4 fragColor;

vec2 calcJoin (vec4 prev, vec4 curr, vec4 next) {
	float x = step / viewport.z;
	vec2 normalLeft = normalize(vec2(
		-(curr.x - prev.x) * .5, x
	) / viewport.zw);
	vec2 normalRight = normalize(vec2(
		-(next.x - curr.x) * .5, x
	) / viewport.zw);

	vec2 bisec = normalize(normalLeft + normalRight);
	float bisecLen = abs(1. / dot(normalLeft, bisec));

	return bisec * bisecLen;
}

void main () {
	gl_PointSize = 1.5;

	// shift source id to hide line edges
	float id = id - 1.;

	float ss = samplesPerStep;

	// hack to workaround rounding spikes artifacts
	float tr = floor(translate.x / samplesPerStep);

	// calc average of curr..next sampling points
	vec4 sampleCurr = pick((id) * ss, (id - 2.) * ss, tr * ss);
	vec4 sampleNext = pick((id + 1.) * ss, (id - 2.) * ss, tr * ss);
	vec4 samplePrev = pick((id - 1.) * ss, (id - 2.) * ss, tr * ss);

	// compensate for sampling rounding
	float tr2 = translate.x / samplesPerStep - floor(translate.x / samplesPerStep);
	vec2 position = vec2(
		step * (id - tr2) / viewport.z,
		sampleCurr.x * .5 + .5
	);

	vec2 join = calcJoin(samplePrev, sampleCurr, sampleNext);

	// FIXME: limit join by prev vertical
	// float maxJoinX = min(abs(join.x * thickness), 40.) / thickness;
	// join.x *= maxJoinX / join.x;

	position += sign * join * .5 * thickness / viewport.zw;
	gl_Position = vec4(position * 2. - 1., 0, 1);

	fragColor = color / 255.;

	// mark adjacent texture with different color
	// if (translate.x + id * samplesPerStep > dataLength) {
	// 	fragColor.x *= .5;
	// }

	fragColor.a *= opacity;
}
