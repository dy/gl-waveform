// pick texture sample linearly interpolated:
// default webgl interpolation is more broken

#pragma glslify: lerp = require('./lerp.glsl')

uniform sampler2D data0, data1;
uniform vec2 dataShape;
uniform float sum, sum2;
uniform float textureId;

vec4 pick (float offset, float baseOffset) {
	offset = max(offset, 0.);

	vec2 uv = vec2(
		mod(offset, dataShape.x) + .5,
		floor(offset / dataShape.x) + .5
	) / dataShape;

	// uv.y -= textureId;

	// use last sample for textures past 2nd
	if (uv.y > 2.) {
		vec4 sample = texture2D(data1, vec2(1, 1));
		sample.x = 0.;
		return sample;
	}

	else if (uv.y > 1.) {
		uv.y = uv.y - 1.;

		vec4 sample = texture2D(data1, uv);

		// if right sample is from the next texture - align it to left texture
		if (offset >= dataShape.x * dataShape.y &&
			baseOffset < dataShape.x * dataShape.y) {
			sample.y += sum;
			sample.z += sum2;
		}

		return sample;
	}

	else return texture2D(data0, uv);
}

// shift is passed separately for higher float32 precision of offset
// export pickLinear for the case of emulating texture linear interpolation
vec4 pickLinear(float offset, float baseOffset) {
	float offsetLeft = floor(offset);
	float offsetRight = ceil(offset);
	float t = offset - offsetLeft;
	vec4 left = pick(offsetLeft, baseOffset);

	if (t == 0. || offsetLeft == offsetRight) return left;
	else {
		vec4 right = pick(offsetRight, baseOffset);

		// float it = 1. - t;
		// vec4 res = vec4(
		// 	t * right.x + it * left.x,
		// 	t * right.y + it * left.y,
		// 	t * right.z + it * left.z,
		// 	t * right.w + it * left.w
		// );
		// return res;
		return lerp(left, right, t);
	}
}

#pragma glslify: export(pickLinear)
