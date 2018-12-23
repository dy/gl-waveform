// pick texture sample linearly interpolated:
// default webgl interpolation is more broken

precision highp float;

#pragma glslify: lerp = require('./lerp.glsl')
#pragma glslify: Samples = require('./samples.glsl')

// pick integer offset
vec4 picki (Samples samples, float offset, float baseOffset, float translate) {
	// translate is here in order to remove float32 error (at the latest stage)
	offset += translate;
	baseOffset += translate;

	vec2 uv = vec2(
		floor(mod(offset, samples.shape.x)) + .5,
		floor((offset) / samples.shape.x) + .5
	) / samples.shape;

	vec4 sample;

	// prev texture
	if (uv.y < 0.) {
		uv.y += 1.;
		sample = texture2D(samples.prev, uv);
	}
	// next texture
	else if (uv.y > 1.) {
		uv.y -= 1.;
		sample = texture2D(samples.next, uv);
	}
	// curr texture
	else {
		sample = texture2D(samples.data, uv);
	}

	return sample;
}

// shift is passed separately for higher float32 precision of offset
// export pickLinear for the case of emulating texture linear interpolation
vec4 pick (Samples samples, float offset, float baseOffset, float translate) {
	float offsetLeft = floor(offset);
	float offsetRight = ceil(offset);
	float t = offset - offsetLeft;
	vec4 left = picki(samples, offsetLeft, baseOffset, translate);

	if (t == 0. || offsetLeft == offsetRight) {
		return left;
	}
	else {
		vec4 right = picki(samples, offsetRight, baseOffset, translate);

		return lerp(left, right, t);
	}
}



#pragma glslify: export(pick)
