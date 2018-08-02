// pick texture sample linearly interpolated:
// default interpolation is broken

#pragma glslify: lerp = require('./lerp.glsl')

uniform sampler2D data0, data1;
uniform vec2 dataShape;
uniform float dataLength, textureId, sum, sum2, total;

vec4 pick (float offset, float baseOffset) {
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
vec4 pick (float offset, float baseOffset, float shift) {
	return pick(offset + shift, baseOffset + shift);
}

// shift is passed separately for higher float32 precision of offset
// export pickLinear for the case of emulating texture linear interpolation
vec4 pickLinear(float offset, float baseOffset, float shift) {
	float offsetLeft = floor(offset);
	float offsetRight = ceil(offset);
	float t = offset - offsetLeft;
	if (offsetLeft == offsetRight) {
		offsetRight = ceil(offset + .5);
		t = 0.;
	}

	vec4 left = pick(offsetLeft, baseOffset, shift);
	vec4 right = pick(offsetRight, baseOffset, shift);

	return lerp(left, right, t);
}

#pragma glslify: export(pick)
