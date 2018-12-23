// pick texture sample linearly interpolated:
// default webgl interpolation is more broken

precision highp float;

#pragma glslify: lerp = require('./lerp.glsl')

uniform vec2 dataShape;
uniform float dataLength;

// pick integer offset
vec4 picki (sampler2D samples, float offset, float baseOffset, float translate) {
	// translate is here in order to remove float32 error (at the latest stage)
	offset += translate;
	baseOffset += translate;

	vec2 uv = vec2(
		floor(mod(offset, dataShape.x)) + .5,
		floor((offset) / dataShape.x) + .5
	) / dataShape;

	return texture2D(samples, uv);
}

// shift is passed separately for higher float32 precision of offset
// export pickLinear for the case of emulating texture linear interpolation
vec4 pick (sampler2D samples, float offset, float baseOffset, float translate) {
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
