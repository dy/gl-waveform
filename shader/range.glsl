// output range-average samples line with sdev weighting

#pragma glslify: lerp = require('./lerp.glsl')
#pragma glslify: pick = require('./pick.glsl')

precision highp float;

attribute float id, sign;

uniform float opacity, thickness, step, samplesPerStep;
uniform vec2 scale, translate;
uniform vec4 viewport, color;

varying vec4 fragColor;

void main() {
	gl_PointSize = 1.5;

	// shift source id to provide left offset
	// float id = id - 1.;

	// FIXME: make end point cut more elegant
	// if (translate.x + id * samplesPerStep >= total - 1.) return;

	float ss = samplesPerStep;
	float tr = floor(translate.x / samplesPerStep);

	// calc average of curr..next sampling points
	vec4 sample0 = pick(id * ss, (id - 1.) * ss, tr );
	vec4 sample1 = pick((id + 1.) * ss, (id - 1.) * ss, tr );

	float avgCurr = (sample1.y - sample0.y) / samplesPerStep;

	// only scales more than 1 skip steps
	// σ(x)² = M(x²) - M(x)²
	float variance = abs(
		(sample1.z - sample0.z) / samplesPerStep - avgCurr * avgCurr
	);
	float sdev = sqrt(variance);

	// compensate for sampling rounding
	float translateOff = translate.x / samplesPerStep - floor(translate.x / samplesPerStep);
	vec2 position = vec2(
		// avg render is shifted by .5 relative to direct sample render for proper positioning
		(step * (id + .5 - translateOff) ) / viewport.z,
		avgCurr * .5 + .5
	);

	vec4 samplePrev = pick((id - 1.) * ss, (id - 1.) * ss, tr);
	vec4 sampleNext = pick((id + 2.) * ss, (id - 1.) * ss, tr);

	float avgPrev = (sample0.y - samplePrev.y) / samplesPerStep;
	float avgNext = (sampleNext.y - sample1.y) / samplesPerStep;

	float x = step / viewport.z;
	vec2 normalLeft = normalize(vec2(
		-(avgCurr - avgPrev) * .5, x
	) / viewport.zw);
	vec2 normalRight = normalize(vec2(
		-(avgNext - avgCurr) * .5, x
	) / viewport.zw);

	vec2 bisec = normalize(normalLeft + normalRight);
	vec2 vert = vec2(0, 1);
	float bisecLen = abs(1. / dot(normalLeft, bisec));
	float vertRightLen = abs(1. / dot(normalRight, vert));
	float vertLeftLen = abs(1. / dot(normalLeft, vert));
	float maxVertLen = max(vertLeftLen, vertRightLen);
	float minVertLen = min(vertLeftLen, vertRightLen);
	float vertSdev = 2. * sdev * viewport.w / thickness;

	vec2 join;


	// less than 1
	// if (scale.x * viewport.z < 1.) {}

	// sdev less than projected to vertical shows simple line
	// FIXME: sdev should be compensated by curve bend
	if (false && vertSdev < maxVertLen) {
		// sdev more than normal but less than vertical threshold
		// rotates join towards vertical
		if (vertSdev > minVertLen) {
			float t = (vertSdev - minVertLen) / (maxVertLen - minVertLen);
			join = lerp(bisec * bisecLen, vert * maxVertLen, t);
		}
		else {
			join = bisec * bisecLen;
		}
	}
	// sdev more than projected to vertical modifies only y coord
	else {
		join = vert * vertSdev;
	}

	position += sign * join * .5 * thickness / viewport.zw;
	gl_Position = vec4(position * 2. - 1., 0, 1);

	fragColor = color / 255.;

	// if (translate.x + id * samplesPerStep > dataLength) {
	// 	fragColor.x *= .5;
	// }

	fragColor.a *= opacity;
}
