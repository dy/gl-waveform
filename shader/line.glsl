// direct sample output, connected by line, to the contrary to range

#pragma glslify: lerp = require('./lerp.glsl')

precision highp float;

attribute float id, sign;

uniform sampler2D data0, data1;
uniform float opacity, thickness, step, textureId, total,
		samplesPerStep, sum, sum2, dataLength;
uniform vec2 scale, translate, dataShape;
uniform vec4 viewport, color;

varying vec4 fragColor;

// pick sample from the source texture
vec4 pickSample (float offset, float baseOffset) {
	offset = max(offset, 0.);
	offset = min(offset, total - 1.);

	vec2 uv = vec2(
		mod(offset, dataShape.x) + .5,
		floor(offset / dataShape.x) + .5
	) / dataShape;

	uv.y -= textureId;

	if (uv.y > 1.) {
		uv.y = uv.y - 1.;

		vec4 sample = texture2D(data1, uv);

		// if right sample is from the next texture - align it to left texture
		if (offset >= dataLength * (textureId + 1.) &&
			baseOffset < dataLength * (textureId + 1.)) {
			sample.y += sum;
			sample.z += sum2;
		}

		return sample;
	}
	else return texture2D(data0, uv);
}

vec4 pick(float id, float baseId) {
	float offset = id * samplesPerStep;
	float baseOffset = baseId * samplesPerStep;

	float offsetLeft = floor(offset);
	float offsetRight = ceil(offset);
	float t = offset - offsetLeft;
	if (offsetLeft == offsetRight) {
		offsetRight = ceil(offset + .5);
		t = 0.;
	}

	// hack to workaround rounding spikes artifacts
	float tr = floor(floor(translate.x / samplesPerStep) * samplesPerStep);

	vec4 left = pickSample(offsetLeft + tr, baseOffset);
	vec4 right = pickSample(offsetRight + tr, baseOffset);

	return lerp(left, right, t);
}

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

	// calc average of curr..next sampling points
	vec4 sampleCurr = pick((id), (id - 2.));
	vec4 sampleNext = pick((id + 1.), (id - 2.));
	vec4 samplePrev = pick((id - 1.), (id - 2.));

	// compensate for sampling rounding
	float tr = translate.x / samplesPerStep - floor(translate.x / samplesPerStep);
	vec2 position = vec2(
		step * (id + 1. - tr) / viewport.z,
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
	if (translate.x + id * samplesPerStep > dataLength) {
		fragColor.x *= .5;
	}

	fragColor.a *= opacity;
}
